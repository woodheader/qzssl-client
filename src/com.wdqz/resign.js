const axios = require('axios');
const queryString = require('querystring');
var myutil = require('./util');
var client = require('./client');
var util = require('util');
var fs = require('fs');
var fns = require('date-fns');
var schedule = require('node-schedule');
const admZip = require("adm-zip");
const childProcess = require('child_process');
const os = require('os');
const dns = require("node:dns");
const date = require("silly-datetime");
const path = require('path');

// 域名数据文件
var domainDataPath = __dirname + '/../data/domain.json';

// 系统日志
var sysLogPath = __dirname + '/../data/log.json';

// 证书文件下载存放路径
var downloadDir = __dirname + '/../cert/';

// 求知平台API-host
var qzApi = 'https://openapi.wdqz.cc/api';

// 求知平台API-获取域名列表
var qzGetHostList = qzApi + '/ssl-client/get-host-list';

// 求知平台API-提交开启续签域名，生成续签订单
var qzCreateResignOrder = qzApi + '/ssl-client/validate-and-create-order';

function newJobId(prefix) {
    return prefix + '-' + date.format(new Date(), 'YYYYMMDDHHmmss') + '-' + process.pid;
}

function logInfo(jobId, tag, msg) {
    myutil.writeLog('[' + jobId + '][' + tag + '] ' + msg);
}

function logOk(jobId, tag, msg) {
    myutil.writeLog('[' + jobId + '][' + tag + '][OK] ' + msg);
}

function logErr(jobId, tag, msg) {
    myutil.writeLog('[' + jobId + '][' + tag + '][ERR] ' + msg);
}

/**
 * 任务入口
 * - 定时从求知平台同步证书订单数据到客户端，每隔10分钟执行一次（域名、验证文件内容、证书文件内容、续签状态）
 * - 定时检测开启中的域名，检测是否即将过期，即将过期的，发送给求知平台，生成新续签订单(服务端会这是续签状态=待验证)
 * - 检测续签状态，为待验证的，将txt文件内容写入设置的验证文件目录；为已签发的，将证书文件内容写入设置的证书文件
 * - 当有已签发状态的证书，执行 nginx -s reload
 * - 执行完 reload 后，设置续签状态为：续签完成
 */
function startJob(httpServer)
{
    schedule.scheduleJob('*/10 * * * *', function () {
        getHostListFromQz();
    });

    schedule.scheduleJob('0 1 * * *', function () {
        validateAndCreateOrder();
    });

    schedule.scheduleJob('*/15 * * * *', function () {
        validateAndInstall();
    });

    // 开启wss日志输出server
    client.wsReadSyslog(httpServer);
}

/**
 * 定时从求知平台同步证书订单数据到客户端，每隔10分钟执行一次（域名、验证文件内容、证书文件内容、续签状态）
 */
function getHostListFromQz()
{
    const jobId = newJobId('SYNC');
    const startedAt = Date.now();
    logInfo(jobId, 'SYNC', '开始同步域名列表');
    const token = myutil.generateToken();
    if (!token) {
        logErr(jobId, 'SYNC', '未配置 AppId/AppToken，跳过同步');
        return false;
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': token,
    };
    axios.post(qzGetHostList, {}, {headers}).then((response) => {
        if (response.data.code !== 10000) {
            logErr(jobId, 'SYNC', '平台返回失败：' + response.data.msg);
            return false;
        }
        const list = Array.isArray(response.data.resultObject) ? response.data.resultObject : [];
        if (!fs.existsSync(domainDataPath)) {
            fs.writeFileSync(domainDataPath, '[]', 'utf8');
        }
        let domainData = fs.readFileSync(domainDataPath, 'utf8');
        if (util.isNullOrUndefined(domainData) || domainData === '') {
            domainData = '[]';
        }
        let newDomainList = [];
        let curDomainList;
        try {
            curDomainList = JSON.parse(domainData);
        } catch (e) {
            curDomainList = [];
        }
        if (!Array.isArray(curDomainList)) curDomainList = [];
        list.forEach((itemNew) => {
            let initData = {
                host: itemNew.host,
                end_time: itemNew.end_time,
                open_status: 'close',
                sign_status: itemNew.sign_status,
                sign_status_title: itemNew.sign_status_title,
                txt_name: itemNew.txt_name,
                txt_content: itemNew.txt_content,
                ssl_download_url: itemNew.ssl_download_url,
                txt_dir: '',
                ssl_certificate: '',
                ssl_certificate_key: '',
                installed_end_time: '',
                installed_download_url: '',
                installed_ssl_certificate: '',
                installed_ssl_certificate_key: '',
                installed_time: ''
            }
            let hostNew = itemNew.host;
            curDomainList.forEach((itemCur) => {
                let hostCur = itemCur.host;
                if (hostCur === hostNew) {
                    initData.open_status = itemCur.open_status;
                    initData.txt_dir = itemCur.txt_dir;
                    initData.ssl_certificate = itemCur.ssl_certificate;
                    initData.ssl_certificate_key = itemCur.ssl_certificate_key;
                    initData.installed_end_time = itemCur.installed_end_time || '';
                    initData.installed_download_url = itemCur.installed_download_url || '';
                    initData.installed_ssl_certificate = itemCur.installed_ssl_certificate || '';
                    initData.installed_ssl_certificate_key = itemCur.installed_ssl_certificate_key || '';
                    initData.installed_time = itemCur.installed_time || '';
                    // 本地状态是“续签完成”时：仅当平台返回“待申请”(无续签订单)或平台返回“已签发且与本地已安装一致”才保留本地完成态；否则以平台状态为准
                    if (itemCur.sign_status === 35 && (itemNew.sign_status === 10 || (itemNew.sign_status === 30 && itemCur.installed_end_time && itemCur.installed_end_time === itemNew.end_time))) {
                        initData.sign_status = itemCur.sign_status;
                        initData.sign_status_title = itemCur.sign_status_title;
                    }
                }
            });
            newDomainList.push(initData);
        });
        myutil.atomicWriteFileSync(domainDataPath, JSON.stringify(newDomainList));
        logOk(jobId, 'SYNC', '同步完成：共 ' + list.length + ' 个域名，已写入 domain.json，耗时 ' + (Date.now() - startedAt) + 'ms');
    }).catch((error) => {
        logErr(jobId, 'SYNC', '同步异常：' + (error && error.message ? error.message : String(error)));
    })
}

/**
 * 定时将开启中的域名发送给求知平台，检测是否即将过期，即将过期的，生成新续签订单
 * - 每天凌晨0:10执行一次
 */
function validateAndCreateOrder()
{
    const jobId = newJobId('RENEW');
    const startedAt = Date.now();
    logInfo(jobId, 'RENEW', '开始检测即将过期域名并发起续签');
    if (!fs.existsSync(domainDataPath)) {
        logErr(jobId, 'RENEW', 'domain.json 不存在，跳过续签检测');
        return false;
    }
    let domainJson = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(domainJson) || domainJson === '') {
        logErr(jobId, 'RENEW', 'domain.json 为空，跳过续签检测');
        return false;
    }
    let needResignList = [];
    let domainList;
    try {
        domainList = JSON.parse(domainJson);
    } catch (e) {
        logErr(jobId, 'RENEW', 'domain.json 解析失败，跳过续签检测：' + e.message);
        return false;
    }
    if (!Array.isArray(domainList)) {
        logErr(jobId, 'RENEW', 'domain.json 格式不正确，跳过续签检测');
        return false;
    }
    // 当前时间+1个月
    let oneMonthLater = fns.addMonths(new Date(), 1);
    domainList.forEach((item) => {
        // 开启中且待申请
        if (item.open_status === 'open' && item.sign_status === 10) {
            let endDate = fns.parseISO(item.end_time);
            if (fns.isAfter(oneMonthLater, endDate) || fns.isEqual(oneMonthLater, endDate)) {
                needResignList.push(item.host);
            }
        }
    });
    if (needResignList.length > 0) {
        logInfo(jobId, 'RENEW', '符合续签条件域名：' + needResignList.length + ' 个（' + needResignList.join(', ') + '）');
        let token = myutil.generateToken();
        if (!token) {
            logErr(jobId, 'RENEW', '未配置 AppId/AppToken，跳过发起续签');
            return false;
        }
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': token,
        };
        const reqs = [];
        needResignList.forEach((host) => {
            const data = { host };
            reqs.push(axios.post(qzCreateResignOrder, data, { headers }).then((response) => {
                if (response.data.code !== 10000) {
                    logErr(jobId, 'RENEW:' + host, '发起续签失败：' + response.data.msg);
                    return false;
                }
                logOk(jobId, 'RENEW:' + host, '发起续签成功');
                return true;
            }).catch((error) => {
                logErr(jobId, 'RENEW:' + host, '发起续签异常：' + (error && error.message ? error.message : String(error)));
                return false;
            }));
        })
        Promise.allSettled(reqs).then((results) => {
            const okCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
            const failCount = results.length - okCount;
            logInfo(jobId, 'RENEW', '续签请求完成：成功 ' + okCount + '，失败 ' + failCount + '，耗时 ' + (Date.now() - startedAt) + 'ms');
        });
    } else {
        logOk(jobId, 'RENEW', '无符合续签条件域名，耗时 ' + (Date.now() - startedAt) + 'ms');
    }
}

/**
 * 检测已开启续签的域名列表
 * - 待验证状态的，将txt验证文件写入验证目录
 * - 已签发状态的，将证书文件写入证书文件
 * - 每15分钟执行一次
 */
function validateAndInstall()
{
    const jobId = newJobId('INSTALL');
    const startedAt = Date.now();
    logInfo(jobId, 'INSTALL', '开始检查并安装验证文件/证书文件');
    if (!fs.existsSync(domainDataPath)) {
        fs.writeFileSync(domainDataPath, '', 'utf8');
    }
    let domainJson = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(domainJson) || domainJson === '') {
        logErr(jobId, 'INSTALL', 'domain.json 为空，跳过安装');
        return false;
    }
    if (os.platform() !== 'linux') {
        logErr(jobId, 'INSTALL', '当前系统非 Linux，跳过安装');
        return false;
    }
    let domainList;
    try {
        domainList = JSON.parse(domainJson);
    } catch (e) {
        logErr(jobId, 'INSTALL', 'domain.json 解析失败，跳过安装：' + e.message);
        return false;
    }
    if (!Array.isArray(domainList)) {
        logErr(jobId, 'INSTALL', 'domain.json 格式不正确，跳过安装');
        return false;
    }
    const openList = domainList.filter((d) => d && d.open_status === 'open');
    logInfo(jobId, 'INSTALL', '已开启自动续签域名：' + openList.length + ' 个');
    domainList.forEach((item) => {
        if (item.open_status === 'open') {
            // 待验证状态
            if (item.sign_status === 15) {
                const stepStart = Date.now();
                try {
                    if (!item.txt_dir || !item.txt_name) {
                        logErr(jobId, 'INSTALL:' + item.host, '验证文件信息缺失（txt_dir/txt_name），跳过写入');
                        return;
                    }
                    const txtDirNormalized = path.normalize(item.txt_dir);
                    const wellKnownSuffix = path.join('.well-known', 'pki-validation');
                    const targetDir = txtDirNormalized.includes(wellKnownSuffix)
                        ? txtDirNormalized
                        : path.join(txtDirNormalized, wellKnownSuffix);
                    const txtFile = path.join(targetDir, item.txt_name);
                    fs.mkdirSync(path.dirname(txtFile), { recursive: true });
                    fs.writeFileSync(txtFile, item.txt_content, 'utf8');
                    logOk(jobId, 'INSTALL:' + item.host, '写入验证文件成功：' + txtFile + '，耗时 ' + (Date.now() - stepStart) + 'ms');
                } catch (e) {
                    logErr(jobId, 'INSTALL:' + item.host, '写入验证文件失败：' + e.message);
                    return;
                }
            }
            // 已签发状态
            if (item.sign_status === 30) {
                const stepStart = Date.now();
                if (item.installed_end_time && item.installed_end_time === item.end_time) {
                    const sameDownload = item.installed_download_url && item.installed_download_url === item.ssl_download_url;
                    const samePath = item.installed_ssl_certificate && item.installed_ssl_certificate_key
                        && item.installed_ssl_certificate === item.ssl_certificate
                        && item.installed_ssl_certificate_key === item.ssl_certificate_key;
                    const pemOk = item.ssl_certificate && fs.existsSync(item.ssl_certificate);
                    const keyOk = item.ssl_certificate_key && fs.existsSync(item.ssl_certificate_key);
                    if (sameDownload && samePath && pemOk && keyOk) {
                        logOk(jobId, 'INSTALL:' + item.host, '证书已安装且未变化，跳过下载/部署（end_time=' + item.end_time + '）');
                        return;
                    }
                }
                // 下载zip文件
                const saveZipDir = downloadDir + item.host;
                if (!fs.existsSync(saveZipDir)) {
                    fs.mkdirSync(saveZipDir);
                }
                const saveZipFile = saveZipDir + '/' + item.host + '.zip';
                logInfo(jobId, 'INSTALL:' + item.host, '开始下载证书压缩包：' + item.ssl_download_url);
                myutil.downloadFile(item.ssl_download_url, saveZipFile).then(() => {
                    logOk(jobId, 'INSTALL:' + item.host, '证书压缩包下载完成：' + saveZipFile);
                    // 解压文件
                    const zip = new admZip(saveZipFile);
                    zip.extractAllTo(saveZipDir, true);
                    logOk(jobId, 'INSTALL:' + item.host, '证书压缩包解压完成');
                    // 移动.pem和.key文件到用户设置的目录
                    const pemFile = saveZipDir + '/' + item.host + '/nginx/' + item.host + '.pem';
                    const keyFile = saveZipDir + '/' + item.host + '/nginx/' + item.host + '.key';
                    myutil.moveFile(pemFile, item.ssl_certificate);
                    logInfo(jobId, 'INSTALL:' + item.host, 'PEM 文件移动：' + pemFile + ' -> ' + item.ssl_certificate);
                    myutil.moveFile(keyFile, item.ssl_certificate_key);
                    logInfo(jobId, 'INSTALL:' + item.host, 'KEY 文件移动：' + keyFile + ' -> ' + item.ssl_certificate_key);
                    // 执行 nginx reload
                    childProcess.exec('sudo nginx -s reload', (err, stdout, stderr) => {
                        if (err) {
                            logErr(jobId, 'INSTALL:' + item.host, 'nginx reload 失败：' + err);
                            myutil.removeFile(saveZipDir);
                            return;
                        }
                        if (stderr) {
                            logErr(jobId, 'INSTALL:' + item.host, 'nginx reload 失败：' + stderr);
                            myutil.removeFile(saveZipDir);
                            return;
                        }
                        logOk(jobId, 'INSTALL:' + item.host, 'nginx reload 成功');
                        // 执行成功后，将当前域名续签状态改为：续签完成
                        myutil.updateDomainFields(item.host, {
                            sign_status: 35,
                            sign_status_title: '续签完成',
                            installed_end_time: item.end_time || '',
                            installed_download_url: item.ssl_download_url || '',
                            installed_ssl_certificate: item.ssl_certificate || '',
                            installed_ssl_certificate_key: item.ssl_certificate_key || '',
                            installed_time: date.format(new Date(), 'YYYY-MM-DD HH:mm:ss')
                        });
                        logOk(jobId, 'INSTALL:' + item.host, '已部署证书并设置续签状态：续签完成，耗时 ' + (Date.now() - stepStart) + 'ms');
                        myutil.removeFile(saveZipDir);
                    });
                }).catch((error) => {
                    logErr(jobId, 'INSTALL:' + item.host, '证书下载或处理失败：' + (error && error.message ? error.message : String(error)));
                    // 删除临时生成的证书文件目录
                    myutil.removeFile(saveZipDir);
                })
            }
        }
    });
    logInfo(jobId, 'INSTALL', '本轮检查已完成（异步下载/安装可能仍在进行），耗时 ' + (Date.now() - startedAt) + 'ms');
}

module.exports = {startJob};
