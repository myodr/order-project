# DynamoDB 테이블 스키마

아래는 **주문접수 애플리케이션**에서 사용되는 **5개 테이블**의 스키마 정보를 마크다운 표 형식으로 정리한 것입니다.

---

## 1. ProductsTable

| **Attribute** | **Type** | **Description**                      |
|---------------|----------|--------------------------------------|
| `productId`   | String   | **(PK)** 상품 고유 ID                |
| `sellerId`    | String   | 상품 등록자(판매자) ID (GSI용)       |
| `name`        | String   | 상품명                               |
| `description` | String   | 상품 설명                             |
| `imageUrl`    | String   | 상품 이미지 URL                       |
| `basePrice`   | Number   | 기본 가격                             |
| `stock`       | Number   | 전체 재고 수량                        |

- **Primary Key**: `productId` (Partition Key)
- **Global Secondary Index**: `sellerId-index` (판매자별 상품 조회)

---

## 2. EventsTable

| **Attribute** | **Type** | **Description**                      |
|---------------|----------|--------------------------------------|
| `eventId`     | String   | **(PK)** 이벤트 고유 ID              |
| `sellerId`    | String   | 이벤트 생성자(판매자) ID (GSI용)     |
| `title`       | String   | 이벤트 제목                           |
| `description` | String   | 이벤트 설명                           |
| `startTime`   | String   | 이벤트 시작 시간 (ISO 8601)          |
| `endTime`     | String   | 이벤트 종료 시간 (ISO 8601)          |
| `status`      | String   | `PENDING`, `ACTIVE`, `CLOSED` 등     |

- **Primary Key**: `eventId`
- **Global Secondary Index**: `sellerId-index` (판매자별 이벤트 조회)

---

## 3. EventItemsTable

| **Attribute** | **Type** | **Description**                                |
|---------------|----------|------------------------------------------------|
| `eventId`     | String   | **(PK)** 이벤트 고유 ID                        |
| `productId`   | String   | **(SK)** 상품 고유 ID                          |
| `eventPrice`  | Number   | 이벤트에서 적용되는 가격                       |
| `stock`       | Number   | 이벤트 단위 재고                               |
| `description` | String   | (선택) 이벤트 내 상품에 대한 상세 설명         |
| `imageUrl`    | String   | (선택) 이벤트 내 상품 이미지를 별도로 저장 시  |

- **Primary Key**: `(eventId, productId)`
    - `eventId`: Partition Key
    - `productId`: Sort Key
- (선택) **Global Secondary Index**: `productId-index` → 상품별 조회

---

## 4. OrdersTable

| **Attribute**  | **Type** | **Description**                                             |
|----------------|----------|-------------------------------------------------------------|
| `orderId`      | String   | **(PK)** 주문 고유 ID                                       |
| `eventId`      | String   | 주문이 발생한 이벤트 ID                                     |
| `buyerId`      | String   | 구매자 ID (GSI용)                                           |
| `orderItems`   | List     | 주문 상품 목록 (e.g. `[{productId, quantity, totalPrice}]`) |
| `totalAmount`  | Number   | 총 주문 금액                                                |
| `orderTime`    | String   | 주문 시간 (ISO 8601)                                       |
| `status`       | String   | `PENDING`, `CONFIRMED`, `DISPATCHED`, 등                    |
| `buyerName`    | String   | 주문자(수령인) 이름                                         |
| `buyerPhone`   | String   | 주문자(수령인) 연락처                                       |
| `zipcode`      | String   | 우편번호                                                    |
| `address`      | String   | 상세 주소                                                  |

- **Primary Key**: `orderId`
- **Global Secondary Index**: `buyerId-index` (구매자별 주문 조회)

---

## 5. UsersTable

| **Attribute** | **Type** | **Description**                    |
|---------------|----------|------------------------------------|
| `userId`      | String   | **(PK)** 사용자 고유 ID            |
| `name`        | String   | 사용자 이름                         |
| `email`       | String   | 이메일                             |
| `role`        | String   | `BUYER`, `SELLER` 등 사용자 역할    |

- **Primary Key**: `userId`

---

## 참고사항

- **스키마리스 특성**
    - DynamoDB는 RDBMS와 달리 스키마(칼럼)를 엄격히 제한하지 않습니다.
    - 여기서는 유지보수 편의를 위해 각 테이블에 저장하는 속성을 문서화했습니다.

- **주요 PK/GSI**
    - **ProductsTable**: PK=`productId`, GSI=`sellerId-index`
    - **EventsTable**: PK=`eventId`, GSI=`sellerId-index`
    - **EventItemsTable**: PK=`eventId`, SK=`productId`
    - **OrdersTable**: PK=`orderId`, GSI=`buyerId-index`
    - **UsersTable**: PK=`userId`

이상으로 **주문접수 애플리케이션**에 사용되는 **DynamoDB 테이블**의 스키마 정리입니다.
t

# DynamoDB 테이블 생성 스크립트 (로컬환경 vs 서버환경)

아래는 5개의 DynamoDB 테이블(**ProductsTable**, **EventsTable**, **EventItemsTable**, **OrdersTable**, **UsersTable**)을 로컬환경과 서버환경에 각각 생성하기 위한 스크립트 예시입니다.

---

## 1. 로컬환경 (DynamoDB Local)

DynamoDB Local을 사용할 때는 `--endpoint-url http://localhost:8000` 옵션을 지정해 테이블을 생성합니다.  
테스트 용도로 **ProvisionedThroughput**을 최소화(1/1)했지만, 필요에 따라 값을 조정할 수 있습니다.

### 1.1 ProductsTable

```bash
aws dynamodb create-table \
  --table-name ProductsTable \
  --attribute-definitions AttributeName=productId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=productId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```
### 1.2 EventsTable
```bash
aws dynamodb create-table \
  --table-name EventsTable \
  --attribute-definitions AttributeName=eventId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000

```
### 1.3 EventItemsTable
```bash
aws dynamodb create-table \
  --table-name EventItemsTable \
  --attribute-definitions \
      AttributeName=eventId,AttributeType=S \
      AttributeName=productId,AttributeType=S \
  --key-schema \
      AttributeName=eventId,KeyType=HASH \
      AttributeName=productId,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000

```
### 1.4 OrdersTable
```bash
aws dynamodb create-table \
  --table-name OrdersTable \
  --attribute-definitions \
      AttributeName=orderId,AttributeType=S \
      AttributeName=buyerId,AttributeType=S \
  --key-schema \
      AttributeName=orderId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "buyerId-index",
        "KeySchema": [
          { "AttributeName": "buyerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000

```
### 1.5 UsersTable
```bash
aws dynamodb create-table \
  --table-name UsersTable \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```


## 상품등록 예시 스크립트

```bash
#!/bin/bash

# Example script to insert 5 products into "ProductsTable" (DynamoDB).
# Adjust --endpoint-url if you are using DynamoDB Local (e.g., http://localhost:8000).
# Remove --endpoint-url if you are inserting into AWS production environment.

aws dynamodb put-item \
--table-name ProductsTable \
--item '{
"productId": {"S": "prod-001"},
"sellerId": {"S": "kgs"},
"name": {"S": "차오차이간짜장"},
"description": {"S": "직화로 맛나요"},
"basePrice": {"N": "4000"},
"stock": {"N": "10"},
"imageUrl": {"S": "https://sitem.ssgcdn.com/86/38/53/item/1000582533886_i1_1200.jpg"}
}' \
--endpoint-url http://localhost:8000

aws dynamodb put-item \
--table-name ProductsTable \
--item '{
"productId": {"S": "prod-002"},
"sellerId": {"S": "kgs"},
"name": {"S": "오랄비치약"},
"description": {"S": "시원해요"},
"basePrice": {"N": "3500"},
"stock": {"N": "50"},
"imageUrl": {"S": "https://sitem.ssgcdn.com/93/46/77/item/1000548774693_i1_550.jpg"}
}' \
--endpoint-url http://localhost:8000

aws dynamodb put-item \
--table-name ProductsTable \
--item '{
"productId": {"S": "prod-003"},
"sellerId": {"S": "kgs"},
"name": {"S": "홍삼진고스틱"},
"description": {"S": "언제나건강하게.."},
"basePrice": {"N": "30000"},
"stock": {"N": "20"},
"imageUrl": {"S": "https://sitem.ssgcdn.com/30/78/77/item/1000649777830_i1_550.jpg"}
}' \
--endpoint-url http://localhost:8000

aws dynamodb put-item \
--table-name ProductsTable \
--item '{
"productId": {"S": "prod-004"},
"sellerId": {"S": "kgs"},
"name": {"S": "야쿠르트 윌"},
"description": {"S": "150mlx15개 - 대장건강을 책임져줄께요"},
"basePrice": {"N": "8000"},
"stock": {"N": "100"},
"imageUrl": {"S": "https://sitem.ssgcdn.com/51/64/48/item/0000008486451_i3_1200.jpg"}
}' \
--endpoint-url http://localhost:8000

aws dynamodb put-item \
--table-name ProductsTable \
--item '{
"productId": {"S": "prod-005"},
"sellerId": {"S": "kgs"},
"name": {"S": "한입떡갈비"},
"description": {"S": "신선식품-원산지:국산"},
"basePrice": {"N": "9000"},
"stock": {"N": "20"},
"imageUrl": {"S": "https://sitem.ssgcdn.com/67/31/20/item/1000006203167_i1_1200.jpg"}
}' \
--endpoint-url http://localhost:8000
```



아래는 **DynamoDB**에서 5개의 테이블(**ProductsTable**, **EventsTable**, **EventItemsTable**, **OrdersTable**, **UsersTable**)을 생성하기 위한 **AWS CLI 스크립트**를 **마크다운(README.md)** 형식으로 정리한 예시입니다.

---

# DynamoDB Table Creation Scripts

다음은 **로컬(Local) 환경**과 **AWS 서버(Production) 환경**에서 DynamoDB 테이블을 생성하기 위한 예시 스크립트입니다.

## 1. 로컬 환경 (DynamoDB Local)

### 1.1 ProductsTable

```bash
aws dynamodb create-table \
  --table-name ProductsTable \
  --attribute-definitions AttributeName=productId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=productId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```

### 1.2 EventsTable

```bash
aws dynamodb create-table \
  --table-name EventsTable \
  --attribute-definitions AttributeName=eventId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```

### 1.3 EventItemsTable

```bash
aws dynamodb create-table \
  --table-name EventItemsTable \
  --attribute-definitions \
      AttributeName=eventId,AttributeType=S \
      AttributeName=productId,AttributeType=S \
  --key-schema \
      AttributeName=eventId,KeyType=HASH \
      AttributeName=productId,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```

### 1.4 OrdersTable

```bash
aws dynamodb create-table \
  --table-name OrdersTable \
  --attribute-definitions \
      AttributeName=orderId,AttributeType=S \
      AttributeName=buyerId,AttributeType=S \
  --key-schema \
      AttributeName=orderId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "buyerId-index",
        "KeySchema": [
          { "AttributeName": "buyerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 1,
          "WriteCapacityUnits": 1
        }
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```

### 1.5 UsersTable

```bash
aws dynamodb create-table \
  --table-name UsersTable \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --endpoint-url http://localhost:8000
```

---

## 2. AWS 서버(Production) 환경

**서버 환경(실제 AWS)**에서는 일반적으로 **On-Demand(PAY_PER_REQUEST)** 모드를 사용합니다.  
아래 스크립트에서는 `--endpoint-url`을 생략하고, `--billing-mode PAY_PER_REQUEST`를 적용합니다.

### 2.1 ProductsTable

```bash
aws dynamodb create-table \
  --table-name ProductsTable \
  --attribute-definitions AttributeName=productId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=productId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        }
      }
    ]' \
  --billing-mode PAY_PER_REQUEST
```

### 2.2 EventsTable

```bash
aws dynamodb create-table \
  --table-name EventsTable \
  --attribute-definitions AttributeName=eventId,AttributeType=S AttributeName=sellerId,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "sellerId-index",
        "KeySchema": [
          { "AttributeName": "sellerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        }
      }
    ]' \
  --billing-mode PAY_PER_REQUEST
```

### 2.3 EventItemsTable

```bash
aws dynamodb create-table \
  --table-name EventItemsTable \
  --attribute-definitions \
      AttributeName=eventId,AttributeType=S \
      AttributeName=productId,AttributeType=S \
  --key-schema \
      AttributeName=eventId,KeyType=HASH \
      AttributeName=productId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

### 2.4 OrdersTable

```bash
aws dynamodb create-table \
  --table-name OrdersTable \
  --attribute-definitions \
      AttributeName=orderId,AttributeType=S \
      AttributeName=buyerId,AttributeType=S \
  --key-schema \
      AttributeName=orderId,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "buyerId-index",
        "KeySchema": [
          { "AttributeName": "buyerId", "KeyType": "HASH" }
        ],
        "Projection": {
          "ProjectionType": "ALL"
        }
      }
    ]' \
  --billing-mode PAY_PER_REQUEST
```

### 2.5 UsersTable

```bash
aws dynamodb create-table \
  --table-name UsersTable \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## 3. 참고사항

1. **GSI(글로벌 보조 인덱스) 설정**
  - 스크립트에서 GSI의 `ProvisionedThroughput` 항목은 JSON 형태상 필수이지만,  
    실제로 **`--billing-mode PAY_PER_REQUEST`**를 사용하면 **테이블과 GSI 모두 On-Demand** 과금이 적용됩니다.

2. **로컬 vs 서버**
  - 로컬(DynamoDB Local)에서는 `--endpoint-url http://localhost:8000`
  - 서버(Production)에서는 해당 옵션 없이 **AWS 기본 엔드포인트**(및 자격 증명 설정)를 사용

3. **명령 순서**
  - 테이블 5개를 하나씩 순차적으로 생성 가능
  - 혹은 CloudFormation/Serverless Framework를 사용하면 YAML/JSON으로 테이블 정의를 일괄 선언 가능

4. **테이블 생성 후**
  - **PUT / GET / UPDATE** 등의 DynamoDB API(또는 AWS CLI 명령)로 데이터를 삽입, 조회할 수 있습니다.

이상으로 **로컬 및 서버 환경에서 DynamoDB 테이블을 생성하기 위한 스크립트** 예시였습니다.

---
## local 환경 테스트
### - lambda
1. **aws-cli 환경 선택**
  - intelliJ 등 aws-tools-kit credentials 선택
  - aws terminal 실행 및 터미널 상단에서 실행환경 확인
2. **express 실행**
  - local-lambda 폴더에서 npm start 실행
  - 
### - frontend(vue)
  - proxy router 설정 : /api 경로를 localhost:3000 으로 연결
  - 
1. **admin 환경**
```bash
  cd ./frontend/admin
  npm run dev
```

2. **user 환경**
```bash
  cd ./frontend/user
  npm run dev
```
### test page
1. getEventPage 호출
  http://localhost:3000/getEventPage/4c6d53fb-87eb-409c-9b7b-dadb5896973

---

