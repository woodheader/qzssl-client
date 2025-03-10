var config = require('./config');
const jwt = require('jsonwebtoken');
const date = require('silly-datetime');
var fs = require('fs');
const util = require("util");
const axios = require("axios");
const childProcess = require('child_process');

/**
 * 当前时间时间戳
 * @returns {number}
 */
function getTimestamp() {
    const timestampInSeconds = Math.floor(Date.now() / 1000);
    return timestampInSeconds;
}

/**
 * 生成JWT
 * @param appId
 * @param appToken
 */
function generateToken() {
    // 示例 payload
    const payload = {
        iss:  'https://qzssl.com/', // 固定值
        aud:  'https://qzssl.com/', // 固定值
        iat:  getTimestamp(),    // 签发时间
        nbf:  getTimestamp(),     // 在此时间之前，该jwt都是不可用
        exp:  getTimestamp() + 7200,     // jwt 有效期 2 小时
        data:  {
            app_id: config.getConfig().app_id,
        },
    };
    // 密钥
    const secret = config.getConfig().app_token;
    // 生成 JWT
    return jwt.sign(payload, secret);
}

/**
 * 系统日志
 */
function writeLog(errorMsg) {
    const sysLogPath = __dirname + '/../data/log.json';
    // 检查文件是否存在，不存在就创建
    if (!fs.existsSync(sysLogPath)) {
        fs.writeFileSync(sysLogPath, '', 'utf8');
    }
    const curTime = date.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
    let data = curTime + ' - ' + errorMsg + "\n";
    // 写文件
    fs.appendFileSync(sysLogPath, data, 'utf8');
}

/**
 * 下载文件
 */
async function downloadFile(url, saveToFile)
{
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
        })
        const writer = fs.createWriteStream(saveToFile);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        })
    } catch (error) {
        console.log('文件下载失败', error);
    }
}

/**
 * 删除文件
 */
function removeFile(file)
{
    try {
        //fs.unlinkSync(file);
        childProcess.exec('sudo rm -rf ' + file, (err, stdout, stderr) => {
            if (err) {
                writeLog('删除文件失败，错误内容：' + err);
            }
            if (stderr) {
                writeLog('删除文件失败，错误内容：' + stderr);
            }
        })
    } catch (error) {
        if (error.code === 'EPERM') {
            writeLog(file + ' 目录或文件没有操作权限：' + error);
        }
    }
}

module.exports = {generateToken, writeLog, downloadFile, removeFile};