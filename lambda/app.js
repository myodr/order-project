const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// 환경 변수로 로컬 환경인지 확인 (기본값: AWS 실환경)
const IS_LOCAL = true;

// 로컬 환경이면 DynamoDB Local을 사용하고, 실환경이면 AWS 기본 DynamoDB 사용
const dynamoDb = new AWS.DynamoDB.DocumentClient(
    IS_LOCAL
        ? { endpoint: "http://host.docker.internal:8000", region: "us-east-1" }
        : {}
);

const PRODUCTS_TABLE = "ProductsTable";
const EVENTS_TABLE = "EventsTable";
const EVENT_ITEMS_TABLE = "EventItemsTable";
const ORDERS_TABLE = "OrdersTable";

/**
 * 상품 등록 API
 * POST /products
 */
exports.createProduct = async (event) => {
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

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Product created successfully", productId })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error creating product", details: error.message }) };
    }
};

/**
 * 이벤트 등록 API
 * POST /events
 */
exports.createEvent = async (event) => {
    const data = JSON.parse(event.body);
    const eventId = uuidv4();

    console.log("check", IS_LOCAL, eventId, data);

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
        // 트랜잭션으로 이벤트와 상품 등록
        await dynamoDb.transactWrite({
            TransactItems: [
                { Put: eventParams },
                ...eventItemsParams
            ]
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Event created successfully", eventId })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Error creating event", details: error.message }) };
    }
};


exports.getOrderPage = async (event) => {
    const eventId = event.pathParameters.event_id;
    const now = new Date().toISOString();

    // 1️⃣ 이벤트 정보 조회 (유효 기간 확인)
    const eventParams = {
        TableName: EVENTS_TABLE,
        Key: { eventId }
    };

    let eventInfo;
    try {
        const eventResult = await dynamoDb.get(eventParams).promise();
        eventInfo = eventResult.Item;

        if (!eventInfo) {
            return { statusCode: 404, body: "이벤트를 찾을 수 없습니다." };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 정보를 가져오는 중 오류 발생" };
    }

    const isExpired = now > eventInfo.endTime;

    // 2️⃣ 이벤트 내 상품 조회 (EventItemsTable)
    const productParams = {
        TableName: EVENT_ITEMS_TABLE,
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId }
    };

    let eventItems = [];
    try {
        const productResult = await dynamoDb.query(productParams).promise();
        eventItems = productResult.Items;
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 상품 정보를 가져오는 중 오류 발생" };
    }

    // 3️⃣ ProductsTable에서 상품 상세 정보 가져오기
    const productIds = eventItems.map(item => item.productId);
    let productDetails = {};

    if (productIds.length > 0) {
        const productQuery = {
            RequestItems: {
                [PRODUCTS_TABLE]: {
                    Keys: productIds.map(id => ({ productId: id }))
                }
            }
        };

        try {
            const productResult = await dynamoDb.batchGet(productQuery).promise();
            productDetails = productResult.Responses[PRODUCTS_TABLE].reduce((acc, product) => {
                acc[product.productId] = product;
                return acc;
            }, {});
        } catch (error) {
            console.error(error);
            return { statusCode: 500, body: "상품 정보를 가져오는 중 오류 발생" };
        }
    }

    // 4️⃣ 이벤트 상품 정보와 ProductsTable 데이터 병합
    const items = eventItems.map(item => {
        const product = productDetails[item.productId] || {};
        return {
            productId: item.productId,
            name: product.name || "상품 정보 없음",
            description: product.description || "",
            imageUrl: product.imageUrl || "",
            eventPrice: item.eventPrice,
            stock: item.stock
        };
    });

    // 3️⃣ 동적 HTML 생성 (Bootstrap 기반)
    const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>주문 이벤트</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
            <style>
                .product { margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
                .product img { width: 100px; cursor: pointer; }
                .product-details { display: none; }
                .quantity-controls { display: flex; align-items: center; }
                .quantity-controls button { width: 30px; transition: background-color 0.1s ease-in-out; }
                /* 모바일에서 hover 효과 제거 */
                @media (hover: none) {
                    .btn:hover {
                        background-color: inherit !important;
                        color: inherit !important;
                    }
                }
                .quantity-controls button:active { background-color: gray !important; }
                #totalAmount { font-size: 1.2em; font-weight: bold; color: #d9534f; text-align: right; margin-top: 10px; }
                .sold-out { color: red; font-weight: bold; }
            </style>
        </head>
        <body class="container mt-4">
            <h2 class="text-center mb-3">이벤트 주문 (${eventInfo.title})</h2>
            <p class="text-center">${eventInfo.description}</p>
            <p class="text-center text-${isExpired ? 'danger' : 'success'}">
                ${isExpired ? '이벤트 종료됨' : `이벤트 기간: ${eventInfo.startTime} ~ ${eventInfo.endTime}`}
            </p>

            ${isExpired ? `<h3 class="text-danger text-center">이벤트가 종료되었습니다.</h3>` : `
            <form id="orderForm">
                <div id="productList">
                    ${items.map(item => `
                        <div class="product border p-2">
                            <div class="d-flex align-items-center">
                                <img src="${item.imageUrl}" alt="${item.name}" class="me-3 toggle-details">
                                <div>
                                    <strong class="toggle-details">${item.name}</strong>
                                    <p class="mb-1 text-muted">₩${item.eventPrice}</p>
                                    ${item.stock === 0 ? `<p class="sold-out">품절</p>` : ''}
                                </div>
                            </div>
                            <div class="product-details mt-2">
                                <p>${item.description}</p>
                            </div>
                            <div class="quantity-controls">
                                ${item.stock > 0 ? `
                                    <button type="button" class="btn btn-outline-secondary btn-sm minus" data-product="${item.productId}" data-price="${item.eventPrice}">-</button>
                                    <input type="text" class="form-control text-center mx-2 quantity" style="width: 40px;" value="0" min="0" max="${item.stock}" readonly data-product="${item.productId}">
                                    <button type="button" class="btn btn-outline-secondary btn-sm plus" data-product="${item.productId}" data-price="${item.eventPrice}">+</button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div id="totalAmount">총 주문금액: ₩0</div>
                
                <div class="mt-4">
                        <label class="form-label">배송지 주소</label>
                        <div class="d-flex">
                            <input type="text" id="zipcode" class="form-control me-2" placeholder="우편번호" readonly>
                            <button type="button" class="btn btn-primary" onclick="searchZipcode()">우편번호 검색</button>
                        </div>
                        <input type="text" id="address" class="form-control mt-2" placeholder="상세 주소 입력">
                </div>

                <button type="button" class="btn btn-danger w-100 mt-3" onclick="showConfirmModal()">주문하기</button>
                </form>

                <!-- Confirm Modal -->
                <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="confirmModalLabel">주문 확인</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p id="confirmText">주문 내용을 확인하세요.</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">취소</button>
                                <button type="submit" class="btn btn-primary" onclick="submitOrder()">확인</button>
                            </div>
                        </div>
                    </div>
                </div>

            </form>
            `}

            <script>
                function updateTotalAmount() {
                    let total = 0;
                    document.querySelectorAll(".quantity").forEach(input => {
                        let quantity = parseInt(input.value) || 0;
                        let price = parseInt(input.dataset.price) || 0;
                        total += quantity * price;
                    });
                    document.getElementById("totalAmount").innerText = "총 주문금액: ₩" + total.toLocaleString();
                }

                document.addEventListener("DOMContentLoaded", function() {
                    document.querySelectorAll(".plus, .minus").forEach(button => {
                        button.addEventListener("click", function() {
                            let input = this.closest(".quantity-controls").querySelector(".quantity");
                            let max = parseInt(input.getAttribute("max")) || 0;
                            let value = parseInt(input.value) || 0;
                            if (this.classList.contains("plus") && value < max) input.value = value + 1;
                            if (this.classList.contains("minus") && value > 0) input.value = value - 1;
                            updateTotalAmount();
                            this.style.backgroundColor = "gray";
                            setTimeout(() => this.style.backgroundColor = "", 100);
                        });
                    });
                });
            </script>
        </body>
        </html>
    `;
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
};


exports.submitOrder = async (event) => {
    const body = new URLSearchParams(event.body);
    const eventId = event.queryStringParameters.event_id;
    const buyerId = "buyer-001";  // 실제 환경에서는 로그인 사용자 ID 사용

    let orderItems = [];
    for (let key of body.keys()) {
        if (key.startsWith("quantity_")) {
            let productId = key.replace("quantity_", "");
            let quantity = parseInt(body.get(key));
            if (quantity > 0) {
                orderItems.push({ productId, quantity });
            }
        }
    }

    if (orderItems.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "주문할 상품을 선택하세요." })
        };
    }

    const orderId = `ORD-${Date.now()}`;
    const totalAmount = orderItems.reduce((sum, item) => sum + (item.quantity * 1000), 0);  // 임시 가격 로직

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
        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html" },
            body: `<h2>주문이 완료되었습니다.</h2><p>주문번호: ${orderId}</p>`
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "주문을 처리하는 중 오류가 발생했습니다." })
        };
    }
};
