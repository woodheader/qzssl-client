var config = require('./config');
const jwt = require('jsonwebtoken');
const date = require('silly-datetime');
var fs = require('fs');
const util = require("util");
const axios = require("axios");
const childProcess = require('child_process');

function atomicWriteFileSync(filePath, content) {
    const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
    try {
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, filePath);
    } finally {
        try {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        } catch (e) {
        }
    }
}

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
    const cfg = config.getConfig();
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || !cfg.app_id || !cfg.app_token) {
        writeLog('未配置 app_id/app_token，无法生成鉴权 token');
        return '';
    }
    // 示例 payload
    const payload = {
        iss:  'https://qzssl.com/', // 固定值
        aud:  'https://qzssl.com/', // 固定值
        iat:  getTimestamp(),    // 签发时间
        nbf:  getTimestamp(),     // 在此时间之前，该jwt都是不可用
        exp:  getTimestamp() + 7200,     // jwt 有效期 2 小时
        data:  {
            app_id: cfg.app_id,
        },
    };
    // 密钥
    const secret = cfg.app_token;
    // 生成 JWT
    return jwt.sign(payload, secret);
}

/**
 * 系统日志
 */
function writeLog(errorMsg) {
    const sysLogPath = __dirname + '/../data/log.json';
    if (!fs.existsSync(sysLogPath)) {
        fs.writeFileSync(sysLogPath, '', 'utf8');
    }
    try {
        const st = fs.statSync(sysLogPath);
        const max = 5 * 1024 * 1024;
        if (st.size >= max) {
            const ts = date.format(new Date(), 'YYYYMMDD-HHmmss');
            const base = sysLogPath.replace(/\.json$/,'');
            const rotated = base + '-' + ts + '.log';
            try {
                fs.renameSync(sysLogPath, rotated);
                fs.writeFileSync(sysLogPath, '', 'utf8');
                try {
                    fs.unlinkSync(sysLogPath + '.lock');
                } catch (e2) {
                }
            } catch (e) {
            }
        }
    } catch (e) {
    }
    const curTime = date.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
    let data = curTime + ' - ' + errorMsg + "\n";
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
        if (!file || typeof file !== 'string') return;
        const child = childProcess.spawn('sudo', ['rm', '-rf', file], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('close', (code) => {
            if (code !== 0) {
                writeLog('删除文件失败，错误内容：' + (stderr || ('exitCode=' + code)));
            }
        });
    } catch (error) {
        if (error.code === 'EPERM') {
            writeLog(file + ' 目录或文件没有操作权限：' + error);
        }
    }
}

/**
 * 移动文件
 */
function moveFile(source, destination)
{
    try {
        if (!source || !destination || typeof source !== 'string' || typeof destination !== 'string') return;
        const child = childProcess.spawn('sudo', ['mv', source, destination], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('close', (code) => {
            if (code !== 0) {
                writeLog('移动文件失败，错误内容：' + (stderr || ('exitCode=' + code)));
            }
        });
    } catch (error) {
        if (error.code === 'EPERM') {
            writeLog(source + ' 目录或文件没有操作权限：' + error);
        }
    }
}

/**
 * 更新domain.json中某个域名的状态
 */
function updateDomainStatus(host, sign_status, sign_status_title)
{
    const domainPath = __dirname + '/../data/domain.json';
    // 检查文件是否存在，不存在就创建
    if (!fs.existsSync(domainPath)) {
        return false;
    }
    let domainJson  = fs.readFileSync(domainPath, 'utf8');
    let domainList;
    try {
        domainList = JSON.parse(domainJson);
    } catch (e) {
        writeLog('domain.json 解析失败，无法更新状态：' + e.message);
        return false;
    }
    if (!Array.isArray(domainList)) {
        return false;
    }
    if (domainList.length <= 0) {
        return false;
    }
    let newDomainList = [];
    domainList.forEach(item => {
        if (item.host === host) {
            item.sign_status = sign_status;
            item.sign_status_title = sign_status_title;
        }
        newDomainList.push(item);
    });
    atomicWriteFileSync(domainPath, JSON.stringify(newDomainList));
}

function updateDomainFields(host, patch)
{
    const domainPath = __dirname + '/../data/domain.json';
    if (!fs.existsSync(domainPath)) {
        return false;
    }
    let domainJson = fs.readFileSync(domainPath, 'utf8');
    let domainList;
    try {
        domainList = JSON.parse(domainJson);
    } catch (e) {
        writeLog('domain.json 解析失败，无法更新字段：' + e.message);
        return false;
    }
    if (!Array.isArray(domainList) || domainList.length <= 0) {
        return false;
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return false;
    }
    let changed = false;
    const newDomainList = domainList.map((item) => {
        if (item && item.host === host) {
            changed = true;
            return Object.assign({}, item, patch);
        }
        return item;
    });
    if (!changed) return false;
    atomicWriteFileSync(domainPath, JSON.stringify(newDomainList));
    return true;
}

module.exports = {generateToken, writeLog, downloadFile, removeFile, moveFile, updateDomainStatus, updateDomainFields, atomicWriteFileSync};
