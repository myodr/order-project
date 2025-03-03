const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const ORDERS_TABLE = "OrdersTable";
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const PRODUCTS_TABLE = "ProductsTable";

/**
 * 주문 생성 API
 * POST /orders
 */
exports.handler = async (event) => {
    const data = JSON.parse(event.body);
    const orderId = uuidv4();

    // 1️⃣ 주문 정보 준비
    const orderItems = data.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity
    }));

    const orderParams = {
        TableName: ORDERS_TABLE,
        Item: {
            orderId,
            eventId: data.eventId,
            buyerId: data.buyerId,
            orderItems,
            totalAmount: data.totalAmount,
            orderTime: new Date().toISOString(),
            status: "PENDING"
        }
    };

    // 2️⃣ ProductsTable 및 EventItemsTable의 재고 업데이트 트랜잭션 생성
    const updateStockParams = orderItems.flatMap(item => [
        {
            Update: {
                TableName: PRODUCTS_TABLE,
                Key: { productId: item.productId },
                UpdateExpression: "SET stock = stock - :q",
                ConditionExpression: "stock >= :q",
                ExpressionAttributeValues: { ":q": item.quantity }
            }
        },
        {
            Update: {
                TableName: EVENT_ITEMS_TABLE,
                Key: { eventId: data.eventId, productId: item.productId },
                UpdateExpression: "SET stock = stock - :q",
                ConditionExpression: "stock >= :q",
                ExpressionAttributeValues: { ":q": item.quantity }
            }
        }
    ]);

    // 3️⃣ EventsTable에서 eventsFullManage 조회
    const eventParams = {
        TableName: EVENTS_TABLE,
        Key: { eventId: data.eventId },
        ProjectionExpression: "eventsFullManage"
    };

    let eventInfo;
    try {
        const eventResult = await dynamoDb.get(eventParams).promise();
        eventInfo = eventResult.Item?.eventsFullManage;

        if (!eventInfo) {
            return { statusCode: 404, body: "이벤트 정보를 찾을 수 없습니다." };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 정보를 가져오는 중 오류 발생" };
    }

    // 4️⃣ eventsFullManage의 재고 업데이트
    const updatedItems = eventInfo.items.map(item => {
        const orderedItem = orderItems.find(o => o.productId === item.productId);
        return orderedItem ? { ...item, stock: item.stock - orderedItem.quantity } : item;
    });

    const updateEventParams = {
        TableName: EVENTS_TABLE,
        Key: { eventId: data.eventId },
        UpdateExpression: "SET eventsFullManage.items = :updatedItems",
        ExpressionAttributeValues: {
            ":updatedItems": updatedItems
        }
    };

    try {
        // 5️⃣ 트랜잭션 실행: 주문 추가, 재고 업데이트, eventsFullManage 업데이트
        await dynamoDb.transactWrite({
            TransactItems: [
                { Put: orderParams },
                ...updateStockParams,
                { Update: updateEventParams }
            ]
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Order created successfully", orderId })
        };
    } catch (error) {
        console.error("주문 처리 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "주문 생성 중 오류 발생", details: error.message })
        };
    }
};
