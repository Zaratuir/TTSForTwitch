const fs = require('fs');
const util = require('util');

const {Readable} = require('stream');

const tmi = require('tmi.js');

const config = require("./config.json") || require("./configBase.json");

const { speak, getInstalledVoices } = require("windows-tts");

const { RtAudio, RtAudioFormat, RtAudioApi } = require("audify");

const naudio = require('naudiodon');

(async ()=>{
	
	console.clear();
	
	let ao = {};
	
	let voices = await getInstalledVoices();
	
	if(voices.length === 0){
		console.log("No Voices Installed. Please Install A Windows TTS Voice. Press Any Key To Exit.");
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.once("data", ()=>{process.exit();});
		return;
	}
	
	let voice = "";
	
	if(config.voice !== "" && voices.indexOf(config.voice) !== -1){
		voice = config.voice;
	} else {
		console.log("Voice from config not found. Loading default voice: " + voices[0]);
		voice = voices[0];
	}

	let devices = naudio.getDevices();

	let deviceSelection = -1;

	let rate = (!isNaN(config.rate)) ? config.rate : 0;

	var BreakException = {};
	try {
		devices.forEach((device,idx)=>{
			if(device.name === config.defaultAudioDevice  && device.maxOutputChannels !== 0){
				deviceSelection = idx;
				throw BreakException;
			}
		});
		console.log("Audio device from config not found. Loading default auido device from system.");
		deviceSelection = -1;
	} catch(e) {
		if(e !== BreakException) throw e;
	}
	
	let bot = config.botName;
	
	let oauth = config.twitchOauthKey;
	
	let channel = config.channel;
	
	let isConnected = false;
	
	let messageQueue = ["Test Message This Is A Considerably Longer Test Message That Will Take A While To Finish Reading To See How Things Respond"];
	
	let readingMessage = false;
	
	let messageDelayFactor = (isNaN(config.messageDelayFactor) ? 72 : config.messageDelayFactor);
	
	let client = {disconnect:()=>null};
	
	console.log("Hello. Welcome to Zara's Twitch TTS.");

	async function awaitUserInput(){
		console.log("Please select a command: 'exit' 'connect' 'disconnect' 'device info' 'rate info' 'voice info' 'channel info' 'message delay' 'sample rate' 'set device' 'set rate' 'set voice' 'set channel' 'set message delay' 'set sample rate' 'refresh devices' 'save current config'");
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", async data => {
			let response = data.toString().trim().toLowerCase();
			switch(response){
				case "exit":
					process.exit();
					return;
					
				case "connect":
					if(channel === ""){
						console.clear();
						console.log("Channel not configured correctly. Please use set channel before attempting to connect.");
						awaitUserInput();
					} else {
						console.clear();
						connectToTwitch();
					}
				break;
				
				case "disconnect":
					console.clear();
					client.disconnect();
					awaitUserInput();
				break;
					
				case "device info":
					console.clear();
					console.log("Currently Selected Device:");
					console.log(devices[deviceSelection]);
					awaitUserInput();
				break;
				
				case "rate info":
					console.clear();
					console.log("The current speech rate is " + rate);
					awaitUserInput();
				break;
				
				case "voice info":
					console.clear();
					console.log("The current voice is " + voice);
					awaitUserInput();
				break;
				
				case "channel info":
					console.clear();
					if(isConnected){
						console.log("Service reading from " + channel);
					} else {
						console.log("Service set to connect to " + channel);
					}
					awaitUserInput();
				break;
				
				case "message delay":
					console.clear();
					console.log("Message Delay Factor is " + messageDelayFactor);
					awaitUserInput();
				break;
				
				
				
				case "set device":
					console.clear();
					awaitDeviceSelection();
				break;
				
				case "set rate":
					console.clear();
					awaitRateSelection();
				break;
				
				case "set voice":
					console.clear();
					awaitVoiceSelection();
				break;
				
				case "set channel":
					console.clear();
					awaitChannelSelection();
				break;
				
				case "set message delay":
					console.clear();
					awaitMessageDelay();
				break;
					
				case "refresh devices":
					devices = naudio.getDevices();
					console.clear();
					console.log("Devices refreshed");
					awaitUserInput();
				break;
				
				default:
					console.clear();
					console.log("Command: [" + response + "] is not defined. Please select another command.");
					awaitUserInput();
			}
			return;
		});
	}
	
	async function connectToTwitch(){
		client = new tmi.Client({
			connection: {
				secure: true,
				reconnect: true
			},
			channels: [ channel ]
		});
		client.connect().then(data=>{
			console.log("Successfully connected to twitch channel: " + channel);
			processNextMessage();
		}).catch(e => {
			console.log(e);
			console.log("Failed to connect to twitch channel: " + channel);
		})
		client.on("message",addMessageToQueue);
		client.on("disconnect",()=>console.log("Disconnected from twitch."));
		awaitUserInput();
	}
	
	function setAO(){
		ao = new naudio.AudioIO({
			outOptions:{
				channelCount: deviceSelection === -1 ? 1 : devices[deviceSelection].maxOutputChannels,
				sampleFormat: naudio.SampleFormat16Bit,
				sampleRate: 12000,
				deviceId: deviceSelection === -1 ? deviceSelection : devices[deviceSelection].id,
				closeOnError: true
			}	
		});
		ao.on("data",chunk=>console.log(chunk));
		ao.on("finish",()=>console.log("Finished"));
		ao.on("close",()=>console.log("Closed"));
	}
	
	async function addMessageToQueue(channel, state, message, self){
		let joiner = "";
		if(state["message-type"] === "chat") joiner = " says ";
		console.log("Message Received: " + state.username + joiner + message);
		messageQueue.push(state.username + joiner + message);
		processNextMessage();
	}
		
	async function processNextMessage(){
		console.log(messageQueue.length);
		if(readingMessage || messageQueue.length === 0) return;
		setAO();
		readingMessage = true;
		let message = messageQueue.shift();
		let words = await speak(message,{rate:rate,voice:voice});
		fs.writeFileSync("tempaudio.wav",words);
		let stream = fs.createReadStream("tempaudio.wav");
		let totalSize = 0;
		stream.on("data", chunk => {
			totalSize += chunk.length;ao.write(chunk)
		});
		stream.on("end",()=>{
			console.log("Begin Waiting");
			let totalTime = totalSize / messageDelayFactor;
			console.log(totalTime / 1000);
			console.log(totalTime);
			setTimeout(()=>{readingMessage = false; console.log("Done Waiting"); processNextMessage();},totalTime);
		});
		ao.start();
	}
	
	async function awaitChannelSelection(){
		console.log("Please enter the streamer chat you would like to listen to.");
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", data => {
			console.clear();
			let myChannel = data.toString().trim();
			if(myChannel.split(" ").length > 1){
				console.log("Channel names may not contain spaces.");
				awaitChannelSelection();
				return;
			}
			channel = myChannel;
			console.log("Channel set to: " + channel);
			awaitUserInput();
		});
	}

	async function awaitDeviceSelection(){
		console.log("Please Select Your Device");
		displayDevices();
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", async data => {
			if(data.toString().trim().toLowerCase() === "r"){
				console.clear();
				awaitUserInput();
				return;
			}
			let selection = parseInt(data.toString().trim())-1;
			if(isNaN(selection)){
				console.clear();
				console.log("Must Select A Number Corresponding To An Output Channel");
				awaitDeviceSelection();
			} else if (selection >= devices.length || selection < 0 || devices[selection].outputChannels == 0){
				console.clear();
				console.log("Must Select A Number Corresponding To An Output Channel");
				awaitDeviceSelection();
			} else {
				console.clear();
				deviceSelection = parseInt(data.toString().trim()) - 1;
				console.log("Device selected.");
				awaitUserInput();
			}
		});
			
	}
	
	async function awaitRateSelection(){
		console.log("Please enter your desired speech rate or type return to return to the menu.")
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", async data => {
			if(data.toString().trim().toLowerCase() === "return"){
				console.clear();
				awaitUserInput();
				return;
			}
			if(isNaN(parseInt(data.toString().trim()))){
				console.clear();
				console.log("You must enter a valid numeric value.");
				awaitRateSelection();
			} else {
				rate = parseInt(data.toString().trim());
				console.clear();
				console.log("Speech rate set to: " + rate);
				awaitUserInput();
			}
		});
	}
	
	async function awaitVoiceSelection(){
		console.log("Please select a voice to use:");
		displayVoices();
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", async data =>{
			console.clear();
			if(data.toString().toLowerCase() === "r"){
				awaitUserInput();
				return;
			}
			let choice = parseInt(data.toString().trim()) - 1;
			if(isNaN(choice) || choice < 0 || choice >= voices.length){
				console.log("Must select a valid voice.");
				awaitVoiceSelection();
				return;
			}
			voice = voices[choice];
			console.log("Voice set to: " + voice);
			awaitUserInput();
		});
	}
	
	async function awaitMessageDelay(){
		console.log("Input Your Numeric Message Delay Factor Or Input R to return to the main menu.");
		process.stdin.setRawMode(false);
		process.stdin.resume();
		process.stdin.once("data", async data=> {
			console.clear();
			if(data.toString().toLowerCase() === "r"){
				awaitUserInput();
				return;
			}
			let choice = parseInt(data.toString().trim())
			if(isNaN(choice) || choice < 0){
				console.log("Must input a valid positive numeric factor.");
				awaitMessageDelay();
				return;
			}
			messageDelayFactor = choice;
			console.log("Message Delay Factor set to: " + choice);
			awaitUserInput();
		});
	}
	
	function displayVoices(){
		voices.forEach((voice,idx) => {
			console.log((idx + 1) + ") " + voice);
		});
		console.log("R) Return to menu.");
	}

	function displayDevices(){
		devices.forEach((obj,idx) => {
			if(obj.maxOutputChannels > 0){
				console.log((idx + 1) + ") " + obj.name);
			}
		})
		console.log("R) Return to main menu.");
	}

	awaitUserInput();
})();