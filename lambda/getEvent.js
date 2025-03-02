const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const PRODUCTS_TABLE = "ProductsTable";

exports.handler = async (event) => {
    const eventId = event.pathParameters.event_id;
    const eventParams = { TableName: EVENTS_TABLE, Key: { eventId } };

    console.log("check event_id", eventId, eventParams);

    try {
        const eventResult = await dynamoDb.get(eventParams).promise();
        const eventInfo = eventResult.Item;

        if (!eventInfo) {
            console.log("not found", eventId);
            return { statusCode: 404, body: "Event not found" };
        }

        const productParams = {
            TableName: EVENT_ITEMS_TABLE,
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": eventId }
        };
        const productResult = await dynamoDb.query(productParams).promise();
        const eventItems = productResult.Items;

        return { statusCode: 200, body: JSON.stringify({ eventInfo, eventItems }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error fetching event data", details: error.message }) };
    }
};
