const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const PRODUCTS_TABLE = "ProductsTable";

exports.handler = async (event) => {
    const eventId = event.pathParameters.event_id;

    // `eventsFullManage`를 포함한 전체 이벤트 정보 조회
    const eventParams = {
        TableName: EVENTS_TABLE,
        Key: { eventId },
        ProjectionExpression: "eventsFullManage"
    };

    let eventInfo;
    try {
        const eventResult = await dynamoDb.get(eventParams).promise();
        eventInfo = eventResult.Item?.eventsFullManage;

        if (!eventInfo) {
            return { statusCode: 404, body: "이벤트 정보를 찾을 수 없습니다." };
        }

        // 삭제된 이벤트 접근 차단
        if (eventInfo.status === 'DELETED') {
            return { 
                statusCode: 410, 
                body: "이 이벤트는 삭제되었습니다.\\n관리자에게 문의하세요." 
            };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 정보를 가져오는 중 오류 발생" };
    }

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventInfo)
    };
};
