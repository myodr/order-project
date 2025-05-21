const AWS = require("aws-sdk");
const Busboy = require("busboy");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const s3 = new AWS.S3();
const S3_BUCKET = "myodr-bucket";
const S3_PREFIX = "images/thumb/";
const URL_PREFIX = `https://myodr.store/`;

exports.handler = async (event) => {
    const busboy = Busboy({ headers: event.headers });
    let fileBuffer = Buffer.alloc(0);
    let mimeType = "";
    let key = "";

    const finished = new Promise((resolve, reject) => {


        busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {

            console.log("filename", filename, fieldname);

            mimeType = filename.mimetype;
            key = `${S3_PREFIX}${uuidv4()}-${filename.filename}`;
            file.on("data", data => { fileBuffer = Buffer.concat([fileBuffer, data]); });

            file.on("end", ()=>{
                console.log("fileBuffer", fileBuffer);
            })


        });


        busboy.on("finish", resolve);
        busboy.on("error", reject);
    });

    const bodyBuffer = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body);

    busboy.end(bodyBuffer);
    await finished;

    // 이미지 리사이즈
    const resizedBuffer = await sharp(fileBuffer)
        .resize(300) // 가로 300px 기준
        .jpeg({ quality: 80 })
        .toBuffer();

    await s3.putObject({
        Bucket: S3_BUCKET,
        Key: key,
        Body: resizedBuffer,
        ContentType: mimeType,
    }).promise();

    return {
        statusCode: 200,
        body: JSON.stringify({ url: URL_PREFIX + key }),
        headers: { "Content-Type": "application/json" }
    };
};
