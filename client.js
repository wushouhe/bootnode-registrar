var Web3 = require('web3');
var net = require('net');
var fs = require('fs');
var request = require('request');
var sleep = require('sleep');

var ipcPath = "/home/geth/.geth/geth.ipc";

if (process.env.ETH_IPC_PATH)
{
    ipcPath = process.env.ETH_IPC_PATH;
}

function web3Client() {
    this.failCount = 0;
}

web3Client.prototype.Refresh = function () {
    if (this.failCount > 15)
    {
        throw new Error("Too many exceptions. . . Exiting")
    }

    if (!this._web3)
    {
        var client = net.Socket();
        var web3 = new Web3(new Web3.providers.IpcProvider(ipcPath, client));

        web3._extend({
            property: 'geth',
            properties:
            [
                new web3._extend.Property({
                    name: 'nodeInfo',
                    getter: 'admin_nodeInfo'
                }),
            ]
        });

        web3._extend({
            property: 'parity',
            properties:
            [
                new web3._extend.Property({
                    name: 'nodeInfo',
                    getter: 'parity_enode'
                }),
            ]
        });

        this._web3 = web3
        this.default = web3.geth;
        this.geth = web3.geth;
        this.parity = web3.parity;
    }

    this._web3.reset();
}

function updateEnode(url, data, callback) {
    console.log("update enode - " + url);
    request.post(
        url,
        {  
            json : data,
            timeout : 1000 
        },
        function (error, response, body) {
            var e = error || response.statusCode != 200;

            if (e)
            {
                console.log(error);
            }
            callback(e, response);
        }
    )
};

function enodeUpdater(web3Client)
{
    this.web3 = web3Client;
}

function runLoop(obj, timeout)
{
    setTimeout(function () {
        obj.Run(obj);
    }, timeout);
}

function readNode(web3, fn)
{
    web3.Refresh();
    
    web3.geth.getNodeInfo(function (error, result) {
        if (error) {
            web3.parity.getNodeInfo(function (error, result){
                if (error)
                {
                    fn(error, result);    
                }
                else
                {
                    var pattern = /enode\:\/\/([^@]+)@[^:]+:(.+)/g;
                    var match = pattern.exec(result.body);
                    
                    if (match)
                    {
                        fn(error, {
                            enode: match[1],
                            port: match[2]
                        });
                    }
                    else
                    {
                        fn("Failed to match", result);
                    }
                }
            });
        }
        else {
            fn(error, {
                enode: result.id,
                port: result.ports.listener
            });
        }
    });
}

enodeUpdater.prototype.Run = function (obj) {
    var web3 = obj.web3;
    readNode(obj.web3, function (error, result) {
        var timeout = 1000 * 10;
        if (error) {
            web3.failCount ++;
            console.log("Fail count: " + web3.failCount + " " + error);
            runLoop(obj, 500);
        }
        else {
            var data = {
                enode: result.enode,
                port: result.port,
                ip: process.env.HOST_IP,
                publicIp : process.env.BOOTNODE_PUBLIC_IP,
                network : process.env.BOOTNODE_NETWORK,
                miner : false || process.env.ENABLE_MINER
            }
            updateEnode(process.env.BOOTNODE_URL, data, function(err, result){
                if (err)
                {
                    runLoop(obj, 1000 * 3);
                }
                else
                {
                    console.log(data);
                    runLoop(obj, 1000 * 15);
                }
            });
        }
    });
};


if (process.env.BOOTNODE_URL)
{
    var client = new web3Client();
    client.Refresh();
    console.log(client);
    //var enode = new enodeUpdater(client);
    //enode.Run(enode);
}
else
{
    console.log("No BOOTNODE_URL,BOOTNODE_NETWORK or BOOTNODE_PUBLIC_IP provided");
}