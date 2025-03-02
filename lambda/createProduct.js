const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const PRODUCTS_TABLE = "ProductsTable";

exports.handler = async (event) => {

    console.log("chk event" , event.body);
    const data = JSON.parse(event.body);
    const productId = uuidv4();

    const params = {
        TableName: PRODUCTS_TABLE,
        Item: {
            productId,
            sellerId: data.sellerId,
            name: data.name,
            description: data.description,
            basePrice: data.basePrice,
            stock: data.stock,
            imageUrl: data.imageUrl
        }
    };

    console.log("params check", params);

    try {
        await dynamoDb.put(params).promise();
        return { statusCode: 200, body: JSON.stringify({ message: "Product created", productId }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error creating product", details: error.message }) };
    }
};
