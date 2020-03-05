
angular.module('drum',[])
.config(['$compileProvider', function($compileProvider) {
	var oldWhiteList = $compileProvider.aHrefSanitizationWhitelist();
	$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|file|blob):|data:image\//);
}])
.controller('drummy' , function($scope,$http) {
	$scope.drums = [];
	$scope.recState = 'idle';
	$scope.position = 0;
	$scope.selectedVoice = 0;
	$scope.selectedPattern = 0;
	$scope.voiceTo = function(i) {$scope.selectedVoice = i;}
	$scope.seqLength = 16;
	$scope.tempo = {value:120};
	$scope.playing = false;
	$scope.kits = [{name:'Hip Hop', path:'drum-808'}, {name:'Electro',  path:'drum-linn'}, {name:'House', path:'drum-909'}, {name:'Techno',  path:'techno'}, {name:'Acoustic',  path:'acoustic'}];
	$scope.kit = $scope.kits[0];
	$scope.populate = function() {
		for (var i = 0; i < $scope.drums.length; i++) {
			$scope.drums[i].sound = new Sound($scope.kit.path + '/' + $scope.drums[i].file);
		};
	}
	$scope.save = function() {
		localStorage.drums = JSON.stringify($scope.drums);
		localStorage.kit = JSON.stringify($scope.kit);
		localStorage.tempo = JSON.stringify($scope.tempo);
	}
	$scope.play = function() {
		for (var i=0;i<$scope.drums.length;i++) {
			if ($scope.drums[i].steps[$scope.selectedPattern][$scope.position]) {
			try {
			$scope.drums[i].sound.play($scope.drums[i].vol,$scope.drums[i].tune)
			}
			catch (e) {
			console.log(e)
			}
			}
		}
	$scope.position < $scope.seqLength-1 ? $scope.position++ : $scope.position = 0;
	$scope.$apply();
	$scope.playza = setTimeout(function(){$scope.play()},(240-$scope.tempo.value)/0.960)
}
$scope.stop = function() {
	clearTimeout($scope.playza);
	$scope.playing = false;
}
if (localStorage.drums) {
	$scope.drums = JSON.parse(localStorage.drums);
	$scope.kit = JSON.parse(localStorage.kit);
	$scope.tempo = JSON.parse(localStorage.tempo);
	$scope.populate();
}
else {
	$http.get('patterns.json')
	.success(function(data){
		$scope.drums = data.drumData;
		$scope.populate();
	});
}
$scope.$watch(function(scope) { return scope.kit },
	function() {
		$scope.stop();
		$scope.position = 0;
		$scope.populate();
	}
	);
$scope.record = function() {
	$scope.recState = 'recording';
	rec.record();
	if (!$scope.playing) {
		$scope.position = 0;
	}
}
$scope.stopRecording = function() {
	$scope.recState = 'finished';
	rec.stop();
	rec.exportWAV(function(blob){
		$scope.downloadLink = URL.createObjectURL(blob);
		$scope.recorded = true;
		$scope.$apply()
	})
	rec.clear();
}
})
.filter('tempo',function(){
	return function(input) {
		return parseInt(input)
	}
})
.directive('dial',function($document){
	return {
		restrict: 'E',
		link: function adjustDial(scope, element, attr) {
			var startY = 0;
			element.css({'transform':'rotate('+scope.$eval(attr.for).dial+'deg)'});
			element.bind('mousedown', function(event) {
				startY = event.screenY;
				var prev = parseFloat(element.css('transform').substring(7)) || 0;
				$document.bind('mousemove',function(e) {
					var next = ((e.screenY-startY)-prev);
					if (next < 140 && next > -140) {
						element.css({'transform':'rotate('+-((e.screenY-startY)-prev)+'deg)'});
						scope.$eval(attr.for).dial = -((e.screenY-startY)-prev);
						scope.$eval(attr.for)[attr.target] = ((-((next-140)/280))*(parseFloat(attr.max)-parseFloat(attr.min)))+parseFloat(attr.min);
						scope.$apply();
					}
				});
				$document.bind('mouseup', function() {
					$document.unbind('mousemove')
				});
			});
		}
	}
});