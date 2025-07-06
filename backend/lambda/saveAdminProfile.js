const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-2' });
const SELLER_TABLE = 'SellerTable';

// 테이블 생성 함수
async function createSellerTableIfNotExists() {
  try {
    const tableParams = {
      TableName: SELLER_TABLE,
      KeySchema: [
        { AttributeName: 'sellerId', KeyType: 'HASH' }  // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'sellerId', AttributeType: 'S' }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };

    await dynamodb.createTable(tableParams).promise();
    console.log(`테이블 ${SELLER_TABLE} 생성 완료`);
    
    // 테이블이 활성화될 때까지 대기
    await dynamodb.waitFor('tableExists', { TableName: SELLER_TABLE }).promise();
    console.log(`테이블 ${SELLER_TABLE} 활성화 완료`);
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log(`테이블 ${SELLER_TABLE}이 이미 존재합니다.`);
    } else {
      console.error('테이블 생성 오류:', error);
      throw error;
    }
  }
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { sellerId, bankName, bankOwner, profileHeader, profileHeaderShow, noticeText } = body;

    if (!sellerId) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'sellerId가 필요합니다.' }) 
      };
    }

    // 테이블이 없으면 생성
    await createSellerTableIfNotExists();

    // 판매자 정보 업데이트
    const updateParams = {
      TableName: SELLER_TABLE,
      Key: { sellerId },
      UpdateExpression: 'SET bankName = :bankName, bankOwner = :bankOwner, profileHeader = :profileHeader, profileHeaderShow = :profileHeaderShow, noticeText = :noticeText, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':bankName': bankName || '',
        ':bankOwner': bankOwner || '',
        ':profileHeader': profileHeader || '',
        ':profileHeaderShow': profileHeaderShow || false,
        ':noticeText': noticeText || '',
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamoDb.update(updateParams).promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: '프로필이 성공적으로 저장되었습니다.',
        sellerId 
      })
    };

  } catch (error) {
    console.error('프로필 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: '프로필 저장 중 오류가 발생했습니다.' })
    };
  }
}; 