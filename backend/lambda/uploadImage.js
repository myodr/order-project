const AWS = require("aws-sdk");
const Busboy = require("busboy");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const s3 = new AWS.S3();
const S3_BUCKET = "myodr-bucket";
const S3_PREFIX = "images/thumb/";
const S3_EDITOR_PREFIX = "images/editor/";
const URL_PREFIX = `https://myodr.store/`;

exports.handler = async (event) => {
    const busboy = Busboy({ headers: event.headers });
    let fileBuffer = Buffer.alloc(0);
    let mimeType = "";
    let key = "";
    let filename = "";
    let isEditorImage = false;

    const finished = new Promise((resolve, reject) => {
        busboy.on("file", (fieldname, file, fileInfo, encoding, mimetype) => {
            console.log("filename", fileInfo.filename, fieldname);
            
            filename = fileInfo.filename;
            mimeType = mimetype;
            
            // TinyMCE 에디터에서 업로드된 이미지인지 확인
            isEditorImage = fieldname === 'image' && event.path === '/admin/uploadImage';
            
            // 에디터용 이미지는 더 큰 크기로 저장
            if (isEditorImage) {
                key = `${S3_EDITOR_PREFIX}${uuidv4()}-${filename}`;
            } else {
                key = `${S3_PREFIX}${uuidv4()}-${filename}`;
            }
            
            file.on("data", data => { 
                fileBuffer = Buffer.concat([fileBuffer, data]); 
            });

            file.on("end", () => {
                console.log("fileBuffer size:", fileBuffer.length);
            });
        });

        busboy.on("finish", resolve);
        busboy.on("error", reject);
    });

    const bodyBuffer = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body);

    busboy.end(bodyBuffer);
    await finished;

    try {
        let resizedBuffer;
        
        if (isEditorImage) {
            // 에디터용 이미지: 최대 800px로 리사이즈, 품질 유지
            resizedBuffer = await sharp(fileBuffer)
                .resize(800, null, { 
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .jpeg({ quality: 85 })
                .toBuffer();
        } else {
            // 썸네일용 이미지: 300px로 리사이즈
            resizedBuffer = await sharp(fileBuffer)
                .resize(300)
                .jpeg({ quality: 80 })
                .toBuffer();
        }

        await s3.putObject({
            Bucket: S3_BUCKET,
            Key: key,
            Body: resizedBuffer,
            ContentType: mimeType,
            CacheControl: 'public, max-age=31536000', // 1년 캐시
        }).promise();

        const imageUrl = URL_PREFIX + key;
        console.log("업로드된 이미지 URL:", imageUrl);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                url: imageUrl,
                location: imageUrl // TinyMCE 호환성을 위한 추가 필드
            }),
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        };
    } catch (error) {
        console.error("이미지 업로드 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "이미지 업로드 중 오류가 발생했습니다." 
            }),
            headers: { "Content-Type": "application/json" }
        };
    }
};
