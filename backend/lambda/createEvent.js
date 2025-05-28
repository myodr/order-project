const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const { parseRequestBody } = require('./utils/requestParser');

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });
const s3 = new AWS.S3();

const EVENTS_TABLE = "EventsTable";
const PRODUCTS_TABLE = "ProductsTable";
// const URL_PREFIX = "https://myodr.store/";

const generateEventKey = () => {
    return Math.random().toString(36).substring(2, 10); // 예: 'a9d2zB7q'
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


    const eventId = uuidv4();
    const eventKey = generateEventKey();
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

    // ✅ EventItemsTable 저장
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
                EventItemsTable: eventItemsToInsert
            }
        }).promise();
    }


    await dynamoDb.put({
        TableName: EVENTS_TABLE,
        Item: eventItem
    }).promise();

    return {
        statusCode: 302,
        headers: {
            Location: `/admin/orders?eventId=${eventId}&sellerId=${sellerId}&token=${token}`
        }
    };
};
