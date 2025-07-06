const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });
const PRODUCTS_TABLE = 'ProductsTable';

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { products, deletedProductIds } = body;
    if (!Array.isArray(products)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'products 배열이 필요합니다.' }) };
    }

    // 일괄 저장 (덮어쓰기)
    const putRequests = products.map(product => {
      // productId가 없으면 새로 생성
      if (!product.productId) {
        product.productId = `${product.sellerId}-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      }
      return {
        PutRequest: {
          Item: product
        }
      };
    });

    // DynamoDB BatchWrite는 25개씩 제한
    for (let i = 0; i < putRequests.length; i += 25) {
      const batch = putRequests.slice(i, i + 25);
      await dynamoDb.batchWrite({
        RequestItems: {
          [PRODUCTS_TABLE]: batch
        }
      }).promise();
    }

    // 삭제 상품 처리 (soft-delete)
    if (Array.isArray(deletedProductIds) && deletedProductIds.length > 0) {
      for (const productId of deletedProductIds) {
        await dynamoDb.update({
          TableName: PRODUCTS_TABLE,
          Key: { productId },
          UpdateExpression: 'SET isActive = :f',
          ExpressionAttributeValues: { ':f': false }
        }).promise();
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '상품이 저장되었습니다.' })
    };
  } catch (error) {
    console.error('상품 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '상품 저장 중 오류가 발생했습니다.' })
    };
  }
}; 