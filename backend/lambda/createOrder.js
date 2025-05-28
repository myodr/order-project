const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const {parseRequestBody} = require("./utils/requestParser");

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const ORDERS_TABLE = "OrdersTable";
const PRODUCTS_TABLE = "ProductsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const EVENTS_TABLE = "EventsTable";

const ORDER_SEQUENCE_TABLE = "OrderSequenceTable";

// 현재 날짜를 YYYYMMDD 형식으로
const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // ex: 20250423

// 1️⃣ orderNo 생성용 seq 조회 및 증가
const getOrderSeq = async () => {
    const params = {
        TableName: ORDER_SEQUENCE_TABLE,
        Key: { dateKey: today },
        UpdateExpression: "SET seq = if_not_exists(seq, :zero) + :incr",
        ExpressionAttributeValues: {
            ":zero": 0,
            ":incr": 1
        },
        ReturnValues: "UPDATED_NEW"
    };

    const result = await dynamoDb.update(params).promise();
    return result.Attributes.seq; // ex: 1, 2, 3...
};

exports.handler = async (event) => {


    const { type, body } = parseRequestBody(event);
    console.log("CHECK EVENT", type, body, event);
    let data = body;

    // console.log("chk type", typeof event.body, event.body);
    // let data;
    // if(typeof event.body === "object"){
    //     data = event.body;
    // }else{
    //     data = JSON.parse(event.body);
    // }


    const orderId = uuidv4();
    const now = new Date().toISOString();
    const seq = await getOrderSeq();
    const orderNo = `${today}-${String(seq).padStart(4, "0")}`; // ex: 20250423-0001

    const {
        eventId,
        buyerId,
        buyerName,
        phone,
        address,
        postcode,
        addressEtc,
        payname,
        items,
        totalAmount
    } = data;

    console.log("chk v2", eventId, items);

    const order = {
        orderId,
        orderNo,
        eventId,
        buyerId,
        buyerName,
        phone,
        postcode,
        addressEtc,
        address,
        payname,           // ✅ 입금자명 저장
        isPaid: false,     // ✅ 입금확인 여부 (초기값 false)
        orderItems: items,
        totalAmount,
        orderTime: now,
        status: "PENDING",
    };

    console.log("chk 3", order);

    const stockUpdateItems = items.flatMap(item => [
        {
            Update: {
                TableName: PRODUCTS_TABLE,
                Key: { productId: item.productId },
                UpdateExpression: "SET stock = stock - :qty",
                ConditionExpression: "stock >= :qty",
                ExpressionAttributeValues: { ":qty": item.quantity }
            }
        },
        {
            Update: {
                TableName: EVENT_ITEMS_TABLE,
                Key: { eventId, productId: item.productId },
                UpdateExpression: "SET stock = stock - :qty",
                ConditionExpression: "stock >= :qty",
                ExpressionAttributeValues: { ":qty": item.quantity }
            }
        }
    ]);

    const eventData = await dynamoDb.get({
        TableName: EVENTS_TABLE,
        Key: { eventId },
        ProjectionExpression: "eventsFullManage"
    }).promise();

    const full = eventData.Item?.eventsFullManage;
    if (!full) {
        return { statusCode: 404, body: JSON.stringify({ message: "이벤트 정보를 찾을 수 없습니다." }) };
    }

    const updatedItems = full.items.map(item => {
        const match = items.find(i => i.productId === item.productId);
        return match ? { ...item, stock: item.stock - match.quantity } : item;
    });

    const updateFullManage = {
        Update: {
            TableName: EVENTS_TABLE,
            Key: { eventId },
            UpdateExpression: "SET eventsFullManage.#items = :updated",
            ExpressionAttributeNames: {
                "#items": "items"
            },
            ExpressionAttributeValues: {
                ":updated": updatedItems
            }

        }
    };

    //order 에 입금은행명, 입금자명을 eventData에서 받아 적용한다
    order.payAccount = full.payAccount;
    order.payAccountOwner = full.payAccountOwner;

    order.sellerId = full.sellerId;
    order.eventKey = full.eventKey;

    try {
        await dynamoDb.transactWrite({
            TransactItems: [
                { Put: { TableName: ORDERS_TABLE, Item: order } },
                ...stockUpdateItems,
                updateFullManage
            ]
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "주문이 성공적으로 접수되었습니다.", orderId , orderNo})
        };
    } catch (error) {
        console.error("주문 실패:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "주문 처리 중 오류 발생", details: error.message })
        };
    }
};
