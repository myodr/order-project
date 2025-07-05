const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const { parseRequestBody } = require('./utils/requestParser');

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });
const s3 = new AWS.S3();

const EVENTS_TABLE = "EventsTable";
const PRODUCTS_TABLE = "ProductsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
// const URL_PREFIX = "https://myodr.store/";

const generateEventKey = () => {
    return Math.random().toString(36).substring(2, 10); // 예: 'a9d2zB7q'
};

exports.handler = async (event) => {

    const { type, body } = parseRequestBody(event);
    console.log("CHECK EVENT", type, body, event);
    let data = body;

    // 수정 모드인지 확인
    const isEditMode = !!data.eventId;
    let eventId, eventKey;

    if (isEditMode) {
        // 수정 모드: 기존 eventId 사용
        eventId = data.eventId;
        
        // 기존 이벤트 정보 조회
        try {
            const existingEvent = await dynamoDb.get({
                TableName: EVENTS_TABLE,
                Key: { eventId }
            }).promise();
            
            if (!existingEvent.Item) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: "수정할 이벤트를 찾을 수 없습니다." })
                };
            }
            
            // 기존 eventKey 유지
            eventKey = existingEvent.Item.eventKey;
        } catch (error) {
            console.error("기존 이벤트 조회 오류:", error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "기존 이벤트 조회 중 오류가 발생했습니다." })
            };
        }
    } else {
        // 신규 생성 모드: 새로운 ID 생성
        eventId = uuidv4();
        eventKey = generateEventKey();
    }

    const startDate = data.startDate;
    const startHour = data.startHour.padStart(2, "0");
    const startMinute = data.startMinute.padStart(2, "0");
    const startTime = `${startDate}T${startHour}:${startMinute}:00Z`;

    const endDate = data.endDate;
    const endHour = data.endHour.padStart(2, "0");
    const endMinute = data.endMinute.padStart(2, "0");
    const endTime = `${endDate}T${endHour}:${endMinute}:00Z`;

    const items = [];
    const productsToInsert = [];

    // TODO:: token 검증
    const token = data.token;
    const sellerId = data.sellerId;

    for (let i = 0; i < 10; i++) {
        console.log("item check", i, `unitPrice${i}`);
        if (data[`unitPrice${i}`] && data[`stock${i}`]) {
            const productSelect = data[`productSelect${i}`];
            const unitPrice = Number(data[`unitPrice${i}`]);
            const stock = Number(data[`stock${i}`]);
            let productId;
            let productName;
            let imageUrl;
            let description;

            if (productSelect) {
                // 기존 상품 선택
                productId = productSelect;
                productName = data[`productName${i}`];
                imageUrl = data[`thumbnailUrl${i}`] || "";
                description = data[`description${i}`];
            } else {
                // 신규 상품 등록
                productId = uuidv4();
                productName = data[`productName${i}`];
                description = data[`description${i}`];
                imageUrl = data[`thumbnailUrl${i}`] || "";

                console.log("chk", imageUrl);
                console.log("chk images", imageUrl);
                productsToInsert.push({
                    PutRequest: {
                        Item: {
                            productId,
                            productName,
                            description,
                            imageUrl,
                            basePrice: unitPrice,
                            stock,
                            createdAt: new Date().toISOString()
                        }
                    }
                });
            }

            items.push({
                productId,
                productName,
                description,
                eventPrice: unitPrice,
                stock,
                imageUrl
            });

            console.log("item added", items);
        }
    }

    if (productsToInsert.length > 0) {
        const batchParams = {
            RequestItems: {
                [PRODUCTS_TABLE]: productsToInsert
            }
        };
        await dynamoDb.batchWrite(batchParams).promise();
    }

    const eventItem = {
        eventId,
        eventKey,
        sellerId,
        eventsFullManage: {
            eventId,
            eventKey,
            sellerId,
            title: data.title,
            description: data.description,
            startTime,
            endTime,
            status: "ACTIVE",
            payAccount: data.payAccount,
            payAccountOwner: data.payAccountOwner,
            items
        }
    };

    try {
        if (isEditMode) {
            // 수정 모드: 기존 EventItemsTable 데이터 삭제 후 새로 생성
            // 1. 기존 EventItems 삭제
            const existingEventItems = await dynamoDb.query({
                TableName: EVENT_ITEMS_TABLE,
                KeyConditionExpression: "eventId = :eid",
                ExpressionAttributeValues: { ":eid": eventId }
            }).promise();

            if (existingEventItems.Items && existingEventItems.Items.length > 0) {
                const deleteRequests = existingEventItems.Items.map(item => ({
                    DeleteRequest: {
                        Key: {
                            eventId: item.eventId,
                            productId: item.productId
                        }
                    }
                }));

                await dynamoDb.batchWrite({
                    RequestItems: {
                        [EVENT_ITEMS_TABLE]: deleteRequests
                    }
                }).promise();
            }

            // 2. EventsTable 업데이트
            await dynamoDb.put({
                TableName: EVENTS_TABLE,
                Item: eventItem
            }).promise();
        } else {
            // 신규 생성 모드: EventsTable에 새로 생성
            await dynamoDb.put({
                TableName: EVENTS_TABLE,
                Item: eventItem
            }).promise();
        }

        // 3. 새로운 EventItems 생성 (수정/신규 공통)
        const eventItemsToInsert = items.map(item => ({
            PutRequest: {
                Item: {
                    eventId,
                    productId: item.productId,
                    eventPrice: item.eventPrice,
                    stock: item.stock
                }
            }
        }));

        if (eventItemsToInsert.length > 0) {
            await dynamoDb.batchWrite({
                RequestItems: {
                    [EVENT_ITEMS_TABLE]: eventItemsToInsert
                }
            }).promise();
        }

        return {
            statusCode: 302,
            headers: {
                Location: `/admin/orders?eventId=${eventId}&sellerId=${sellerId}&token=${token}`
            }
        };
    } catch (error) {
        console.error("이벤트 저장 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: isEditMode ? "이벤트 수정 중 오류가 발생했습니다." : "이벤트 생성 중 오류가 발생했습니다.",
                details: error.message 
            })
        };
    }
};
