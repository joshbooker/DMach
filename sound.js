
try {
var ac = new AudioContext() || WebkitAudioContext() || MozAudioContext(),
recorderNode = ac.createGain();
recorderNode.gain.value = 0.7;
}

catch (e) {
alert("This app doesn't seem to be availible for your browser. Sorry about that. We recommend Firefox or Chrome")
}

function Sound(path) {
	var drum = this;
	drum.buffer = null;
	drum.path = path
	var request = new XMLHttpRequest();
  request.open('GET', drum.path, true);
  request.responseType = 'arraybuffer';
    request.onload = function() {
    ac.decodeAudioData(request.response, function(buffer) {
      drum.buffer = buffer;
    });
  }
  request.send();
}

Sound.prototype.play = function(a,b) {
		var gain = ac.createGain();
		gain.gain.value = a;
		var playSound = ac.createBufferSource();
		playSound.playbackRate.value = b;
		playSound.buffer = this.buffer;
		playSound.connect(gain);
		gain.connect(recorderNode);
		gain.connect(ac.destination);
		playSound.start(0);
}

var rec = new Recorder(recorderNode);