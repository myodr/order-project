const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const PRODUCTS_TABLE = "ProductsTable";

/**
 * 이벤트 등록 API
 * POST /events
 */
exports.handler = async (event) => {
    const data = JSON.parse(event.body);
    const eventId = uuidv4();

    // 1️⃣ ProductsTable에서 상품 정보 조회
    const productIds = data.products.map(product => product.productId);
    let productDetails = {};

    if (productIds.length > 0) {
        const productQuery = {
            RequestItems: {
                [PRODUCTS_TABLE]: {
                    Keys: productIds.map(id => ({ productId: id }))
                }
            }
        };

        try {
            const productResult = await dynamoDb.batchGet(productQuery).promise();
            productDetails = productResult.Responses[PRODUCTS_TABLE].reduce((acc, product) => {
                acc[product.productId] = product;
                return acc;
            }, {});
        } catch (error) {
            console.error("ProductsTable 조회 오류:", error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "상품 정보를 가져오는 중 오류 발생" })
            };
        }
    }

    // 2️⃣ 이벤트 상품 정보 생성 (EventItemsTable)
    const eventItemsParams = data.products.map(product => ({
        Put: {
            TableName: EVENT_ITEMS_TABLE,
            Item: {
                eventId,
                productId: product.productId,
                eventPrice: product.eventPrice,
                stock: product.stock
            }
        }
    }));

    // 3️⃣ `eventsFullManage` JSON 생성
    const fullEventData = {
        eventId,
        sellerId: data.sellerId,
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        status: "ACTIVE",
        items: data.products.map(product => ({
            productId: product.productId,
            name: productDetails[product.productId]?.name || "상품 정보 없음",
            description: productDetails[product.productId]?.description || "",
            imageUrl: productDetails[product.productId]?.imageUrl || "",
            eventPrice: product.eventPrice,
            stock: product.stock
        }))
    };

    // 4️⃣ EventsTable에 이벤트 저장 (`eventsFullManage` 포함)
    const eventParams = {
        TableName: EVENTS_TABLE,
        Item: {
            eventId,
            eventsFullManage: fullEventData
        }
    };

    try {
        await dynamoDb.transactWrite({
            TransactItems: [
                { Put: eventParams },
                ...eventItemsParams
            ]
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Event created successfully", eventId })
        };
    } catch (error) {
        console.error("이벤트 등록 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "이벤트 생성 중 오류 발생", details: error.message })
        };
    }
};
