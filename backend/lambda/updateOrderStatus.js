const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

exports.handler = async (event) => {
    const body = new URLSearchParams(event.body);

    const orderId = body.get("orderId");
    const isPaid = body.get("isPaid") === "on";
    const isShipped = body.get("isShipped") === "on";
    const trackingNo = body.get("trackingNo");

    console.log("body check", body);
    try {
        await dynamoDb.update({
            TableName: "OrdersTable",
            Key: { orderId },
            UpdateExpression: "SET isPaid = :p, isShipped = :s,  trackingNo = :t",
            ExpressionAttributeValues: {
                ":p": isPaid,
                ":s": isShipped,
                ":t":  trackingNo
            }
        }).promise();

        return {
            statusCode: 302,
            headers: {
                Location: `/admin/orders?eventId=${body.get("eventId")}&scrollTo=order-${orderId}`
            }
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "text/html" },
            body: `<h3>업데이트 실패: ${err.message}</h3>`
        };
    }
};
