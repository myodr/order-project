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
  const sellerId = event.queryStringParameters?.sellerId || '';
  if (!sellerId) {
    return { statusCode: 400, body: 'sellerId 파라미터가 필요합니다.' };
  }

  console.log("check sellserId", sellerId);

  try {
    // 테이블이 없으면 생성
    await createSellerTableIfNotExists();

    // 판매자 정보 조회
    let seller = {};
    try {
      const res = await dynamoDb.get({ TableName: SELLER_TABLE, Key: { sellerId } }).promise();
      seller = res.Item || {};
    } catch (e) {
      console.error('판매자 정보 조회 오류:', e);
      // 조회 실패 시 빈 객체로 시작
      seller = {};
    }

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8" />
      <title>My Profile</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      <script src="https://cdn.tiny.cloud/1/h8zwm20qo9yllrv50wszs3qel54vjb18kt5hnk5x3cjm559p/tinymce/6/tinymce.min.js" referrerpolicy="origin"></script>
      <style>
        body { font-family: 'IBM Plex Sans KR', sans-serif; background: #f8f9fa; }
        .profile-box { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 2.5rem 2rem; }
        .form-label { font-weight: bold; }
        .tox-tinymce { border: 1px solid #ced4da !important; border-radius: 0.375rem !important; }
        .back-btn { position: absolute; top: 20px; left: 20px; }
      </style>
    </head>
    <body>
      <a href="/admin?sellerId=${sellerId}" class="btn btn-outline-secondary back-btn">← 뒤로가기</a>
      <div class="profile-box">
        <h4 class="text-center mb-4">My Profile</h4>
        <form id="profileForm">
          <div class="mb-3">
            <label class="form-label">판매자 ID</label>
            <input type="text" class="form-control" value="${sellerId}" readonly />
          </div>
          <div class="mb-3">
            <label class="form-label">입금은행</label>
            <input type="text" class="form-control" name="bankName" value="${seller.bankName || ''}" />
          </div>
          <div class="mb-3">
            <label class="form-label">예금주</label>
            <input type="text" class="form-control" name="bankOwner" value="${seller.bankOwner || ''}" />
          </div>
          <div class="mb-3">
            <label class="form-label">머릿글(이벤트 설명 기본값)</label>
            <textarea id="profileHeaderEditor" name="profileHeader">${seller.profileHeader || ''}</textarea>
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" name="profileHeaderShow" id="profileHeaderShow" ${seller.profileHeaderShow ? 'checked' : ''} />
              <label class="form-check-label" for="profileHeaderShow">이벤트 설명에 기본 머릿글 표시</label>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">유의사항(주문서 하단 안내)</label>
            <textarea id="noticeTextEditor" name="noticeText">${seller.noticeText || ''}</textarea>
          </div>
          <div class="d-grid">
            <button type="submit" class="btn btn-primary">저장</button>
          </div>
        </form>
        <div id="resultMsg" class="mt-3 text-center"></div>
      </div>

      <script>
        // TinyMCE 초기화
        tinymce.init({
          selector: '#profileHeaderEditor',
          height: 200,
          menubar: false,
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
          ],
          toolbar: 'undo redo | blocks | ' +
            'bold italic forecolor | alignleft aligncenter ' +
            'alignright alignjustify | bullist numlist outdent indent | ' +
            'removeformat | help',
          content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; }',
          language: 'ko_KR',
          setup: function(editor) {
            editor.on('change', function() {
              editor.save();
            });
            editor.on('init', function() {
              const imgs = editor.getBody().querySelectorAll('img');
              imgs.forEach(img => {
                if (img.src.startsWith('data:') || img.src.startsWith('blob:')) {
                  fetch(img.src)
                    .then(res => res.blob())
                    .then(blob => {
                      const formData = new FormData();
                      formData.append('image', blob, 'pasted.png');
                      return fetch('/admin/uploadImage', {
                        method: 'POST',
                        body: formData
                      });
                    })
                    .then(res => res.json())
                    .then(result => {
                      if (result.url) {
                        img.src = result.url;
                      }
                    });
                }
              });
            });
          }
        });

        tinymce.init({
          selector: '#noticeTextEditor',
          height: 200,
          menubar: false,
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
          ],
          toolbar: 'undo redo | blocks | ' +
            'bold italic forecolor | alignleft aligncenter ' +
            'alignright alignjustify | bullist numlist outdent indent | ' +
            'removeformat | help',
          content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; }',
          language: 'ko_KR',
          setup: function(editor) {
            editor.on('change', function() {
              editor.save();
            });
            editor.on('init', function() {
              const imgs = editor.getBody().querySelectorAll('img');
              imgs.forEach(img => {
                if (img.src.startsWith('data:') || img.src.startsWith('blob:')) {
                  fetch(img.src)
                    .then(res => res.blob())
                    .then(blob => {
                      const formData = new FormData();
                      formData.append('image', blob, 'pasted.png');
                      return fetch('/admin/uploadImage', {
                        method: 'POST',
                        body: formData
                      });
                    })
                    .then(res => res.json())
                    .then(result => {
                      if (result.url) {
                        img.src = result.url;
                      }
                    });
                }
              });
            });
          }
        });

        document.getElementById('profileForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          // TinyMCE 내용 저장
          tinymce.get('profileHeaderEditor').save();
          tinymce.get('noticeTextEditor').save();
          
          const form = e.target;
          const submitBtn = form.querySelector('button[type="submit"]');
          const originalText = submitBtn.innerText;
          
          // 버튼 비활성화
          submitBtn.disabled = true;
          submitBtn.innerText = '저장 중...';
          
          const data = {
            sellerId: '${sellerId}',
            bankName: form.bankName.value,
            bankOwner: form.bankOwner.value,
            profileHeader: form.profileHeader.value,
            profileHeaderShow: form.profileHeaderShow.checked,
            noticeText: form.noticeText.value
          };

          try {
            const res = await fetch('/admin/profile/save?sellerId=${sellerId}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            const result = await res.json();
            const msg = document.getElementById('resultMsg');
            
            if (res.ok) {
              msg.innerText = result.message || '저장되었습니다.';
              msg.className = 'mt-3 text-center text-success';
            } else {
              msg.innerText = result.error || '저장 실패';
              msg.className = 'mt-3 text-center text-danger';
            }
          } catch (error) {
            const msg = document.getElementById('resultMsg');
            msg.innerText = '저장 중 오류가 발생했습니다.';
            msg.className = 'mt-3 text-center text-danger';
          } finally {
            // 버튼 복원
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
          }
        });
      </script>
    </body>
    </html>
    `;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html
    };
  } catch (error) {
    console.error('프로필 페이지 생성 오류:', error);
    return {
      statusCode: 500,
      body: '프로필 페이지 생성 중 오류가 발생했습니다.'
    };
  }
}; 