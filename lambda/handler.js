'use strict';

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
// 필요시 SNS 사용 (출고 통보)
const sns = new AWS.SNS();

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const ORDER_ROUNDS_TABLE = process.env.ORDER_ROUNDS_TABLE;

/**
 * 상품 등록: 이미지(URL), 설명, 가격, 재고 수량을 받아 상품 등록
 */
module.exports.createProduct = async (event) => {
    const data = JSON.parse(event.body);
    // 간단하게 현재 타임스탬프를 상품ID로 사용 (실제 환경에서는 UUID 등 사용 권장)
    const productId = Date.now().toString();

    const params = {
        TableName: PRODUCTS_TABLE,
        Item: {
            productId,
            image: data.image,          // S3에 업로드 후 URL 저장 가능
            description: data.description,
            price: data.price,
            stock: data.stock,
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ productId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not create product', details: error.message }),
        };
    }
};

/**
 * 주문 차수 생성: 주문 접수 가능한 기간과 접수 대상 상품 목록을 등록
 */
module.exports.createOrderRound = async (event) => {
    const data = JSON.parse(event.body);
    const roundId = Date.now().toString();

    const params = {
        TableName: ORDER_ROUNDS_TABLE,
        Item: {
            roundId,
            startTime: data.startTime, // ISO 8601 형식의 문자열 권장
            endTime: data.endTime,
            productIds: data.productIds, // 주문 접수 가능한 상품 ID 배열
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ roundId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not create order round', details: error.message }),
        };
    }
};

/**
 * 주문 접수: 단일 주문 내 여러 상품 주문을 지원하도록 개선
 * 요청 payload 예시:
 * {
 *   "roundId": "<주문차수ID>",
 *   "userId": "user-123",
 *   "items": [
 *      { "productId": "<상품ID1>", "quantity": 2 },
 *      { "productId": "<상품ID2>", "quantity": 1 }
 *   ]
 * }
 *
 * 각 상품에 대해 재고 확인 및 차감을 트랜잭션으로 처리하며, 주문 테이블에는 items 필드를
 * { productId: { quantity, status, dispatchTime } } 형태로 저장합니다.
 */
module.exports.createOrder = async (event) => {
    const data = JSON.parse(event.body);
    const now = new Date().toISOString();

    // 주문 차수 조회 및 기간 검증
    const roundResult = await dynamoDb.get({
        TableName: ORDER_ROUNDS_TABLE,
        Key: { roundId: data.roundId },
    }).promise();

    if (!roundResult.Item) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid order round' }) };
    }
    if (now < roundResult.Item.startTime || now > roundResult.Item.endTime) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Order round is not active' }) };
    }
    // 각 주문 아이템의 상품이 주문 차수에 포함되어 있는지 검증
    const allowedProducts = roundResult.Item.productIds;
    for (const item of data.items) {
        if (!allowedProducts.includes(item.productId)) {
            return { statusCode: 400, body: JSON.stringify({ error: `Product ${item.productId} not available in this order round` }) };
        }
    }

    // 트랜잭션 아이템 생성 (각 상품의 재고 차감)
    const transactItems = [];
    for (const item of data.items) {
        transactItems.push({
            Update: {
                TableName: PRODUCTS_TABLE,
                Key: { productId: item.productId },
                UpdateExpression: 'set stock = stock - :qty',
                ConditionExpression: 'stock >= :qty',
                ExpressionAttributeValues: { ':qty': item.quantity },
            },
        });
    }

    // 주문 아이템을 map 구조로 구성 (상품별 상태 관리)
    const orderItems = {};
    data.items.forEach((item) => {
        orderItems[item.productId] = {
            quantity: item.quantity,
            status: 'RECEIVED',
            dispatchTime: null,
        };
    });

    const orderId = Date.now().toString();
    transactItems.push({
        Put: {
            TableName: ORDERS_TABLE,
            Item: {
                orderId,
                roundId: data.roundId,
                userId: data.userId,
                orderTime: now,
                status: 'RECEIVED', // 전체 주문 상태 (추후 전체 출고 여부에 따라 업데이트 가능)
                items: orderItems,
            },
        },
    });

    try {
        await dynamoDb.transactWrite({ TransactItems: transactItems }).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ orderId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not create order', details: error.message }),
        };
    }
};

/**
 * 주문 출고: 주문 내 특정 상품(여러 건 가능)을 개별적으로 출고 처리
 * 요청 payload 예시:
 * {
 *    "orderId": "<주문ID>",
 *    "productIds": ["<상품ID1>", "<상품ID2>"]
 * }
 *
 * 각 상품의 items 객체 내의 상태를 "DISPATCHED"로 업데이트하고 dispatchTime을 기록합니다.
 */
module.exports.dispatchOrder = async (event) => {
    const data = JSON.parse(event.body);
    const now = new Date().toISOString();

    // 주문 조회
    let order;
    try {
        const result = await dynamoDb.get({
            TableName: ORDERS_TABLE,
            Key: { orderId: data.orderId },
        }).promise();
        if (!result.Item) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Order not found' }) };
        }
        order = result.Item;
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not retrieve order', details: error.message }),
        };
    }

    // 동적으로 업데이트 표현식 생성 (각 상품에 대해)
    let updateExpr = "set ";
    const updates = [];
    const exprAttrNames = { "#st": "status" };
    const exprAttrValues = { ":dispatched": "DISPATCHED", ":dispatchTime": now };

    data.productIds.forEach((pid, index) => {
        // 주문의 items에 해당 상품이 있는지 확인
        if (order.items && order.items[pid]) {
            const placeholder = "#p" + index;
            exprAttrNames[placeholder] = pid;
            updates.push(`items.${placeholder}.#st = :dispatched`);
            updates.push(`items.${placeholder}.dispatchTime = :dispatchTime`);
        }
    });

    if (updates.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No valid products to dispatch' }) };
    }
    updateExpr += updates.join(", ");

    try {
        await dynamoDb.update({
            TableName: ORDERS_TABLE,
            Key: { orderId: data.orderId },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: exprAttrNames,
            ExpressionAttributeValues: exprAttrValues,
            ReturnValues: "UPDATED_NEW",
        }).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Order items dispatched' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not dispatch order items', details: error.message }),
        };
    }
};

/**
 * 주문 현황 조회: 사용자 고유번호로 주문 내역을 조회 (기존 API)
 */
module.exports.getOrderStatus = async (event) => {
    const userId = event.queryStringParameters.userId;
    const params = {
        TableName: ORDERS_TABLE,
        IndexName: 'UserIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
    };

    try {
        const result = await dynamoDb.query(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify(result.Items),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not get order status', details: error.message }),
        };
    }
};

/**
 * 재고현황과 주문현황을 일괄 조회하는 API (관리자용)
 * - 쿼리 스트링으로 userId가 전달되면 해당 사용자의 주문 내역만 조회하고,
 *   없으면 전체 주문 내역을 조회합니다.
 */
module.exports.getCombinedStatus = async (event) => {
    const userId = event.queryStringParameters ? event.queryStringParameters.userId : null;
    try {
        const productsResult = await dynamoDb.scan({ TableName: PRODUCTS_TABLE }).promise();
        let ordersResult;
        if (userId) {
            ordersResult = await dynamoDb.query({
                TableName: ORDERS_TABLE,
                IndexName: "UserIndex",
                KeyConditionExpression: "userId = :uid",
                ExpressionAttributeValues: { ":uid": userId },
            }).promise();
        } else {
            ordersResult = await dynamoDb.scan({ TableName: ORDERS_TABLE }).promise();
        }
        return {
            statusCode: 200,
            body: JSON.stringify({
                products: productsResult.Items,
                orders: ordersResult.Items,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not get combined status', details: error.message }),
        };
    }
};
