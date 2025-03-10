var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var client = require('./com.wdqz/client');
var resign = require('./com.wdqz/resign');

// 静态文件目录
app.use(express.static('../public'));

// 开启任务 - 定期检查证书是否即将过期
resign.startJob();

// 创建 application/x-www-form-urlencoded 编码解析
let urlencodedParser = bodyParser.urlencoded({ extended: false });
// 保存appId接口
app.post('/api/config', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.saveConfig(req.body.app_id, req.body.app_token);
    res.end(JSON.stringify(result));
});

// 域名列表接口
app.post('/api/domain-list', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.getDomainList(req.body.host, req.body.page, req.body.pagesize);
    res.end(JSON.stringify(result));
});

// 保存域名
/*pp.post('/api/domain-add', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.saveDomain(req.body.domain, req.body.txt_dir, req.body.ssl_certificate, req.body.ssl_certificate_key, 'add');
    res.end(JSON.stringify(result));
});*/

// 修改域名
app.post('/api/domain-edit', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.saveDomain(req.body.host, req.body.txt_dir, req.body.ssl_certificate, req.body.ssl_certificate_key, 'edit');
    res.end(JSON.stringify(result));
});

// 关闭续签
app.post('/api/domain-close', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.saveDomain(req.body.host, req.body.txt_dir, req.body.ssl_certificate, req.body.ssl_certificate_key, 'close');
    res.end(JSON.stringify(result));
});

// 批量关闭自动续签
app.post('/api/domain-batch-close', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let removeList = JSON.parse(req.body.list);
    if (removeList.length <= 0) {
        res.end(JSON.stringify({
            code: 30000,
            msg: '请至少选择一个域名!',
            resultObject: []
        }));
        return false;
    }
    let result;
    removeList.forEach(function (item) {
        result = client.saveDomain(item.host, item.txt_dir, item.ssl_certificate, item.ssl_certificate_key, 'close');
    })
    res.end(JSON.stringify(result));
});

// 批量开启续签
app.post('/api/domain-batch-open', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let openList = JSON.parse(req.body.list);
    if (openList.length <= 0) {
        res.end(JSON.stringify({
            code: 30000,
            msg: '请至少选择一个域名!',
            resultObject: []
        }));
        return false;
    }
    let result;
    openList.forEach(function (item) {
        result = client.saveDomain(item.host, item.txt_dir, item.ssl_certificate, item.ssl_certificate_key, 'open');
    })
    res.end(JSON.stringify(result));
});

// appid回显
app.post('/api/config-info', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.configInfo();
    res.end(JSON.stringify(result));
});

// 系统日志
app.post('/api/sys-log', urlencodedParser, function (req, res) {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let result = client.getSystemLog();
    res.end(JSON.stringify(result));
});


var resign_server = app.listen(18899, function () {
    var host = resign_server.address().address
    var port = resign_server.address().port
    host = (host === '::' ? 'localhost' : host);
    console.log("应用实例，访问地址为 http://%s:%s", host, port)
})