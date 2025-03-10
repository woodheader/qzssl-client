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

// 域名数据文件
var domainDataPath = __dirname + '/../data/domain.json';

// 系统日志
var sysLogPath = __dirname + '/../data/log.json';

// 证书文件下载存放路径
var downloadDir = __dirname + '/../cert/';

// 求知平台API-host
var qzApi = 'https://openapi.wdqz.cc/apidev';

// 求知平台API-获取域名列表
var qzGetHostList = qzApi + '/ssl-client/get-host-list';

// 求知平台API-提交开启续签域名，生成续签订单
var qzCreateResignOrder = qzApi + '/ssl-client/validate-and-create-order';

/**
 * 任务入口
 * - 定时从求知平台同步证书订单数据到客户端，每隔10分钟执行一次（域名、验证文件内容、证书文件内容、续签状态）
 * - 定时检测开启中的域名，检测是否即将过期，即将过期的，发送给求知平台，生成新续签订单(服务端会这是续签状态=待验证)
 * - 检测续签状态，为待验证的，将txt文件内容写入设置的验证文件目录；为已签发的，将证书文件内容写入设置的证书文件
 * - 当有已签发状态的证书，执行 nginx -s reload
 * - 执行完 reload 后，设置续签状态为：续签完成
 */
function startJob()
{
    schedule.scheduleJob('*/10 * * * *', function () {
        myutil.writeLog('1、开始从求知平台同步域名数据');
        getHostListFromQz();
    });

    schedule.scheduleJob('0 1 * * *', function () {
        myutil.writeLog('2、将开启续签且即将一个月内过期的域名生成续签订单');
        validateAndCreateOrder();
    });

    schedule.scheduleJob('*/15 * * * *', function () {
        myutil.writeLog('3、将待验证或待签发状态的txt验证文件和证书文件安装至指定目录');
        validateAndInstall();
    });

    // 开启wss日志输出server
    client.wsReadSyslog();
}

/**
 * 定时从求知平台同步证书订单数据到客户端，每隔10分钟执行一次（域名、验证文件内容、证书文件内容、续签状态）
 */
function getHostListFromQz()
{
    const data = queryString.stringify({
    });
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': myutil.generateToken(),
    };
    axios.post(qzGetHostList, data, {headers}).then((response) => {
        if (response.data.code !== 10000) {
            myutil.writeLog('从求知平台同步域名列表失败，原因：' + response.data.msg);
            return false;
        }
        let domainData = fs.readFileSync(domainDataPath, 'utf8');
        if (util.isNullOrUndefined(domainData) || domainData === '') {
            domainData = '[]';
        }
        let newDomainList = [];
        let curDomainList = JSON.parse(domainData);
        response.data.resultObject.forEach((itemNew) => {
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
                ssl_certificate_key: ''
            }
            let hostNew = itemNew.host;
            curDomainList.forEach((itemCur) => {
                let hostCur = itemCur.host;
                if (hostCur === hostNew) {
                    initData.open_status = itemCur.open_status;
                    initData.txt_dir = itemCur.txt_dir;
                    initData.ssl_certificate = itemCur.ssl_certificate;
                    initData.ssl_certificate_key = itemCur.ssl_certificate_key;
                    // 当前续签状态是：续签完成时，不做覆盖
                    if (itemCur.sign_status === 35) {
                        initData.sign_status = itemCur.sign_status;
                        initData.sign_status_title = itemCur.sign_status_title;
                    }
                }
            });
            newDomainList.push(initData);
        });
        fs.writeFileSync(domainDataPath, JSON.stringify(newDomainList), 'utf8');
    }).catch((error) => {
        console.log(error);
    })
}

/**
 * 定时将开启中的域名发送给求知平台，检测是否即将过期，即将过期的，生成新续签订单
 * - 每天凌晨0:10执行一次
 */
function validateAndCreateOrder()
{
    let domainJson = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(domainJson) || domainJson === '') {
        return false;
    }
    let needResignList = [];
    let domainList = JSON.parse(domainJson);
    // 当前时间+1个月
    let oneMonthLater = fns.addMonths(new Date(), 1);
    domainList.forEach((item) => {
        // 开启中且待申请
        if (item.open_status === 'open' && item.sign_status === '10') {
            let endDate = fns.parseISO(item.end_time);
            if (fns.isAfter(oneMonthLater, endDate) || fns.isEqual(oneMonthLater, endDate)) {
                needResignList.push(item.host);
            }
        }
    });
    if (needResignList.length > 0) {
        let token = myutils.generateToken();
        needResignList.forEach((host) => {
            const data = JSON.stringify({
                host: host,
            });
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': token,
            };
            axios.post(qzCreateResignOrder, data, {headers}).then((response) => {
                if (response.data.code !== 10000) {
                    myutil.writeLog('发起续签失败，原因：' + response.data.msg);
                    return false;
                }
                return true;
            });
        })
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
    if (!fs.existsSync(domainDataPath)) {
        fs.writeFileSync(domainDataPath, '', 'utf8');
    }
    let domainJson = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(domainJson) || domainJson === '') {
        return false;
    }
    if (os.platform() !== 'linux') {
        myutil.writeLog('安装证书文件失败，当前仅支持 *nux 系统');
        return false;
    }
    let domainList = JSON.parse(domainJson);
    domainList.forEach((item) => {
        if (item.open_status === 'open') {
            // 待验证状态
            if (item.sign_status === 15) {
                const txtFile = item.txt_dir + '/' + item.txt_name;
                !fs.existsSync(txtFile) && fs.writeFileSync(txtFile, item.txt_content, 'utf8');
            }
            // 已签发状态
            if (item.sign_status === 30) {
                // 下载zip文件
                const saveZipDir = downloadDir + item.host;
                if (!fs.existsSync(saveZipDir)) {
                    fs.mkdirSync(saveZipDir);
                }
                const saveZipFile = saveZipDir + '/' + item.host + '.zip';
                !fs.existsSync(saveZipFile) && myutil.downloadFile(item.ssl_download_url, saveZipFile).then(() => {
                    // 解压文件
                    const zip = new admZip(saveZipFile);
                    zip.extractAllTo(saveZipDir, true);
                    // 移动.pem和.key文件到用户设置的目录
                    const pemFile = saveZipDir + '/' + item.host + '/nginx/' + item.host + '.pem';
                    const keyFile = saveZipDir + '/' + item.host + '/nginx/' + item.host + '.key';
                    fs.renameSync(pemFile, item.ssl_certificate);
                    fs.renameSync(keyFile, item.ssl_certificate_key);
                    // 执行 nginx reload
                    childProcess.exec('sudo nginx -s reload', (err, stdout, stderr) => {
                        if (err) {
                            myutil.writeLog('执行 nginx -s reload 失败，错误内容：' + err);
                            // 删除临时生成的证书文件
                            myutil.removeFile(saveZipDir);
                            return false;
                        }
                        if (stderr) {
                            myutil.writeLog('执行 nginx -s reload 失败，错误内容：' + stderr);
                            // 删除临时生成的证书文件
                            myutil.removeFile(saveZipDir);
                            return false;
                        }
                        myutil.writeLog('执行 nginx -s reload 成功！stdout：' + stdout);
                        // 执行成功后，将当前域名续签状态改为：续签完成
                        item.sign_status = 35;
                        item.sign_status_title = '续签完成';
                    });
                    // 删除临时生成的证书文件
                    myutil.removeFile(saveZipDir);
                }).catch((error) => {
                    console.log('证书文件下载或处理失败：', error);
                    // 删除临时生成的证书文件目录
                    myutil.removeFile(saveZipDir);
                })
            }
        }
    });
    fs.writeFileSync(domainDataPath, JSON.stringify(domainList), 'utf8');
}

module.exports = {startJob};