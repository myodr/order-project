const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });
const EVENTS_TABLE = 'EventsTable';

exports.handler = async (event) => {
  try {
    const { eventId, sellerId } = JSON.parse(event.body);
    
    if (!eventId || !sellerId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'eventId와 sellerId가 필요합니다.' })
      };
    }

    // 이벤트 존재 여부 및 권한 확인
    const existingEvent = await dynamoDb.get({
      TableName: EVENTS_TABLE,
      Key: { eventId }
    }).promise();

    if (!existingEvent.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '이벤트를 찾을 수 없습니다.' })
      };
    }

    if (existingEvent.Item.sellerId !== sellerId) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '삭제 권한이 없습니다.' })
      };
    }

    // soft-delete: status를 'DELETED'로 변경
    await dynamoDb.update({
      TableName: EVENTS_TABLE,
      Key: { eventId },
      UpdateExpression: 'SET eventsFullManage.#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'DELETED'
      }
    }).promise();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '이벤트가 삭제되었습니다.' })
    };
  } catch (error) {
    console.error('이벤트 삭제 오류:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '이벤트 삭제 중 오류가 발생했습니다.' })
    };
  }
}; 