const fs = require('fs');
const util = require('util');

const { speak, getInstalledVoices } = require("windows-tts");

const { RtAudio, RtAudioFormat, RtAudioApi } = require("audify");

let audio = new RtAudio(RtAudioApi.WINDOWS_DS);

console.log(audio.getDevices());

process.stdout.write("Hello. Welcome to Zara's Twitch TTS.\n Please select an audio device:\n");

async function awaitUserInput(){
	process.stdin.resume();
	process.stdin.once("data", async data => {
		if(data.toString().trim() == "exit"){
			process.exit();
			return;
		} else {			
			console.log("ECHO: " + data.toString().trim()+ "\n");
			fs.unlink("example.mp3",()=>{readText(data.toString().trim())});
		}
	});
}

async function readText(text){
	
	let words = await speak(text,{rate:8});
	
	fs.writeFileSync("audio2.mp3",words)

	awaitUserInput();
}
awaitUserInput();