const AWS = require("aws-sdk");
const Busboy = require("busboy");
const { v4: uuidv4 } = require("uuid");

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });
const s3 = new AWS.S3();

const EVENTS_TABLE = "EventsTable";
const PRODUCTS_TABLE = "ProductsTable";
const S3_BUCKET = "myodr-bucket";
const S3_PREFIX = "images/";
const URL_PREFIX = "https://dk1mmd9frrhx8.cloudfront.net/";

const generateEventKey = () => {
    return Math.random().toString(36).substring(2, 10); // 예: 'a9d2zB7q'
};

exports.handler = async (event) => {
    const busboy = Busboy({ headers: event.headers });
    const fields = {};
    const files = {};

    let fileUploadPromises = [];

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
        if (!filename) {
            // 파일이 없을 경우: 반드시 스트림 소비
            file.resume();
            return;
        }

        if (fieldname.startsWith("thumbnail")) {
            const key = `${S3_PREFIX}${uuidv4()}-${filename}`;
            files[fieldname] = { key, mimetype };

            const uploadPromise = s3.upload({
                Bucket: S3_BUCKET,
                Key: key,
                Body: file,
                ContentType: mimetype
            }).promise();

            fileUploadPromises.push(uploadPromise);
        }
    });

    busboy.on("field", (fieldname, value) => {
        fields[fieldname] = value;
    });

    const parsingFinished = new Promise((resolve, reject) => {
        busboy.on("finish", resolve);
        busboy.on("error", reject);
    });

    console.log("✅ Start parsing form-data");

    // Busboy 파싱 시작
    // ✅ body를 base64 여부 체크하고 변환
    const bodyBuffer = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body);
    busboy.end(bodyBuffer);



    await parsingFinished;
    await Promise.all(fileUploadPromises);

    console.log("✅ Finished file upload");

    const eventId = uuidv4();
    const eventKey = generateEventKey();
    const startDate = fields.startDate;
    const startHour = fields.startHour.padStart(2, "0");
    const startMinute = fields.startMinute.padStart(2, "0");
    const startTime = `${startDate}T${startHour}:${startMinute}:00Z`;

    const endDate = fields.endDate;
    const endHour = fields.endHour.padStart(2, "0");
    const endMinute = fields.endMinute.padStart(2, "0");
    const endTime = `${endDate}T${endHour}:${endMinute}:00Z`;

    const items = [];
    const productsToInsert = [];

    // TODO:: token 검증
    const token = fields.token;
    const sellerId = fields.sellerId;

    for (let i = 0; i < 10; i++) {
        console.log("item check", i, `unitPrice${i}`);
        if (fields[`unitPrice${i}`] && fields[`stock${i}`]) {
            const productSelect = fields[`productSelect${i}`];
            const unitPrice = Number(fields[`unitPrice${i}`]);
            const stock = Number(fields[`stock${i}`]);
            let productId;
            let productName;
            let imageUrl;
            let description;

            if (productSelect) {
                // 기존 상품 선택
                productId = productSelect;
                productName = fields[`productName${i}`];
                imageUrl = fields[`thumbnailUrl${i}`] || "";
                description = fields[`description${i}`];
            } else {
                // 신규 상품 등록
                productId = uuidv4();
                productName = fields[`productName${i}`];
                description = fields[`description${i}`];
                const thumbKey = files[`thumbnail${i}`]?.key;
                imageUrl = thumbKey ? URL_PREFIX + thumbKey : "";

                productsToInsert.push({
                    PutRequest: {
                        Item: {
                            productId,
                            productName,
                            description,
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
            title: fields.title,
            description: fields.description,
            startTime,
            endTime,
            status: "ACTIVE",
            payAccount: fields.payAccount,
            payAccountOwner: fields.payAccountOwner,
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
