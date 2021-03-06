import Promise = require("bluebird");
import childProcess = require("child_process");
import events = require("events");
import os = require("os");

import loclist = require("./ILocListEntry");
import syntax = require("./ISyntaxHighlighting");
import * as omni from "./OmniCompletionmanager"

var channel = global["browserArgs"].channel;
var wsPort = global["browserArgs"].port;

var socket = require("socket.io-client")("http://localhost:" + wsPort + "/" + channel, { path: "/vim-node-plugins/socket.io", transports: ["websocket"] });

export default class Vim extends events.EventEmitter {

    private _serverName: string;
    private _commandNameToFunction = {};
    private _pluginName: string;

    private _omniCompletionManager: omni.OmniCompletionManager;

    public get omniCompleters(): omni.OmniCompletionManager {
        return this._omniCompletionManager;
    }

    constructor(serverName: string, pluginName: string, channel: string) {
        super();
        this._serverName = serverName;
        this._pluginName = pluginName;
        this._omniCompletionManager = new omni.OmniCompletionManager(this);

        socket.on("connect", () => {
            socket.emit("room", process.pid);
        });

        socket.on("disconnect", () => {
            process.exit();
        });

        socket.on("connect_error", (err) => {
            console.log("Error connecting to socket server: " + err.toString());
        });

        socket.on("command", (args) => {
            console.log("Received command: " + args.type);
            this._handleCommand(args);
        });
    }

    public get serverName(): string {
        return this._serverName;
    }

    public get pluginName(): string {
        return this._pluginName;
    }

    public addCommand(name: string, callbackFunction: Function): void {
        // console.log("Registering command: " + name);
        this._commandNameToFunction[name] = callbackFunction;

        this._rawExec("electrify#command#createCommand('" + this._pluginName + "', '" + name + "')")
    }

    public exec(command: string) {
        this._rawExec("electrify#command#execute('" + command + "')");
    }

    public rawExec(command: string) {
        this._rawExec(command);
    }

    public echo(msg: string): void {
        this._rawExec("electrify#command#echo('" + msg + "')");
    }

    public echohl(msg: string, highlightGroup: string): void {
        this._rawExec("electrify#command#echohl('" + msg + "', '" + highlightGroup + "')");
    }

    public setSyntaxHighlighting(syntaxHighlightingInfo: syntax.ISyntaxHighlighting) {
        this._rawExec("electrify#syntax#setKeywordHighlighting('" + JSON.stringify(syntaxHighlightingInfo) + "')");
    }

    public setErrors(errors: loclist.ILocListEntry[]) {
        this._rawExec("electrify#errors#set('" + JSON.stringify(errors) + "')")
    }

    private _rawExec(command: string) {
        var commandToSend = {
            type: "command",
            command: command
        };
        Command.sendCommand(commandToSend);
    }

    private _executeEvent(command: any): void {
        var eventName = command.eventName;
        this.emit(eventName, command.callContext);
    }

    private _executeCommand(command: any): void {
        var commandName = command.command;
        this._commandNameToFunction[commandName](command.callContext);
    }

    private _onBufferChanged(bufferChangeInfo: any): void {
        console.log("Received file update: " + bufferChangeInfo.lines.length + " lines.");
        var newContent = bufferChangeInfo.lines.join(os.EOL);

        this.emit("BufferChanged", { fileName: bufferChangeInfo.bufferName, newContents: newContent });
    }

    private _handleCommand(command: any): void {
        if (command) {
            if (command.type === "execute")
                this._executeCommand(command);
            else if (command.type === "event")
                this._executeEvent(command);
            else if (command.type === "bufferChanged")
                this._onBufferChanged(command.arguments);
        }
    }
}

export class Command {
    public static sendCommand(commandToSend: any): void {
        socket.emit("message", commandToSend);
    }
}
