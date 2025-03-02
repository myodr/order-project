const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";

exports.handler = async (event) => {
    const data = JSON.parse(event.body);
    const eventId = uuidv4();

    const eventParams = {
        TableName: EVENTS_TABLE,
        Item: {
            eventId,
            sellerId: data.sellerId,
            title: data.title,
            description: data.description,
            startTime: data.startTime,
            endTime: data.endTime,
            status: "ACTIVE"
        }
    };

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

    try {
        await dynamoDb.transactWrite({ TransactItems: [{ Put: eventParams }, ...eventItemsParams] }).promise();
        return { statusCode: 200, body: JSON.stringify({ message: "Event created", eventId }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error creating event", details: error.message }) };
    }
};
