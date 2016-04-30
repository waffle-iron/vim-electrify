var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server, { path: "/vim-node-plugins/socket.io" });
var os = require("os");
var path = require("path");
var log = require("./log");
var bodyParser = require("body-parser");
var net = require("net");

require("colors").enabled = true;

import SessionManager from "./SessionManager"
import CommandLineRemoteCommandExecutor from "./Commands/CommandLineRemoteCommandExecutor"
import TcpSocketRemoteCommandExecutor from "./Commands/TcpSocketRemoteCommandExecutor"

// TCP Server
var serverToSocket = {};
var sessionManager;

var tcpServer = net.createServer((tcpSocket) => {
    console.log("tcp: client connected");

    var session = null;

    tcpSocket.on("data", (data) => {
        var dataAsString = data.toString("utf8");
        console.log("tcp: received data: " + data);

        var parsedData = null;
        try {
            parsedData = JSON.parse(data);
        } catch(ex) {
            log.error("tcp: error parsing data", { error: ex});
        }

        if(parsedData.type === "connect") {
            log.info("Got connect event - registering server: " + parsedData.args.serverName);
            session = sessionManager.getOrCreateSession(parsedData.args.serverName);
            serverToSocket[session.name] = tcpSocket;
        } else if(parsedData.type === "command") {

            if(!session) {
                getServerName();
                return;
            }

            console.log("Got command: " + session.name);

        }
    });

    tcpSocket.on("close", () => {
        console.log("tcp: close");
        end();
    });

    tcpSocket.on("error", (err) => {
        console.log("tcp: disconnect");
        end();
    });

    function getServerName() {
        console.log("No session... requesting connect.");
        tcpSocket.write("extropy#tcp#sendConnectMessage()\n");
    }

    function end() {
        if(session) {
            sessionManager.endSession(session.name);
            session = null;
        }
    }

});

tcpServer.listen(4001, "127.0.0.1");

var commandExecutor = new TcpSocketRemoteCommandExecutor(serverToSocket);
sessionManager = new SessionManager(io, commandExecutor);

// TODO: Handle creating session

app.use(bodyParser.json());

app.get("/", function (req, res) {
    res.send("Open for business");
});

app.post("/api/log", (req, res) => {
    console.log("[LOG]:" + JSON.stringify(req.body));
});

app.post("/api/plugin/:serverName/event/:eventName", (req, res) => {
    log.info(req.params);
    log.info(req.body);

    var eventName = req.params.eventName;

    var state = req.body;
    log.info("Received event: " + eventName + " data:" + JSON.stringify(state));
    var session = sessionManager.getOrCreateSession(req.params.serverName);
    session.notifyEvent(eventName, state)

    if(eventName === "VimLeave") {
        sessionManager.endSession(req.params.serverName);
    }

    res.send("done");
});

app.post("/api/plugin/:serverName/omnicomplete/start", (req, res) => {
    console.log("start omnicomplete");

    var body = req.body;

    var session = sessionManager.getOrCreateSession(req.params.serverName);
    session.plugins.startOmniComplete(body);

    res.send("done");
});

app.get("/api/plugin/:serverName", (req, res) => {

    var session = sessionManager.getSession(req.params.serverName);
    var plugins = session.plugins.getAllPlugins();

    var out = "";
    plugins.forEach((plugin) => {
        out += plugin.pluginName + os.EOL;
        out += "** Path: " + plugin.pluginPath + os.EOL;
        out += "** Process: " + plugin.process.pid + os.EOL;
        out += os.EOL;
    });

    res.send(out);
});

// Notify omnicompletion that a file has been updated
app.post("/api/plugin/:serverName/omnicomplete/update", (req, res) => {
    console.log("update omnicomplete");

    var body = req.body;

    var session = sessionManager.getOrCreateSession(req.params.serverName);
    session.plugins.updateOmniComplete(body);

    res.send("done");
});

app.post("/api/plugin/:serverName/:pluginName/:commandName", (req, res) => {
    log.info(req.params);
    log.info(req.body);

    var callContext = req.body;

    var session = sessionManager.getOrCreateSession(req.params.serverName);
    var plugin = session.plugins.getPlugin(req.params.pluginName);
    plugin.execute(req.params.commandName, callContext);

    res.send("done");
});

app.post("/api/stop", function(req, res) {
    console.log("stopping server");
    res.send("closing server.");
    process.exit();
});


io.on("connection", (socket) => {
    log.info("A socket connected.");

    socket.on("room", (room) => {
        log.info("Socket joining room: " + room);
        socket.join(room);
    });

});

process.on("error", (err) => {
    console.log("error: ", err);
});

process.on("uncaughtException", (err) => {
    console.log("error: ", err);
});

server.listen(3000);
console.log("Server up-and-running|" + process.pid);

