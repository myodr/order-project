const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const ORDERS_TABLE = "OrdersTable";

exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    const eventId = body.eventId;
    const buyerId = body.buyerId;
    const orderItems = body.orderItems;

    if (!orderItems.length) {
        return { statusCode: 400, body: JSON.stringify({ error: "No items selected" }) };
    }

    const orderId = `ORD-${Date.now()}`;
    const totalAmount = orderItems.reduce((sum, item) => sum + (item.quantity * 1000), 0);

    const orderData = {
        TableName: ORDERS_TABLE,
        Item: {
            orderId,
            eventId,
            buyerId,
            orderItems,
            totalAmount,
            orderTime: new Date().toISOString(),
            status: "PENDING"
        }
    };

    try {
        await dynamoDb.put(orderData).promise();
        return { statusCode: 200, body: JSON.stringify({ message: "Order submitted", orderId }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error processing order", details: error.message }) };
    }
};
