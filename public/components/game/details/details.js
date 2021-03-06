/**
 * @module {Module} bitballs/components/game/details <game-details>
 * @parent bitballs.components
 *
 * @description Provides a custom element that allows a user
 * to either view a game or edit a game's stats.
 *
 * @body
 *
 * To create a `<game-details>` element pass the [bitballs/models/session]
 * and a [bitballs/models/game] id like:
 *
 * ```
 * <game-details
 *     {session}="session"
 *     {game-id}="gameId"
 *     ></games-details>
 * ```
 *
 * ## Example
 *
 * @demo public/components/game/details/details.html
 *
 */

var Component = require("can/component/component");
var CanMap = require("can/map/");
var List = require("can/list/");
var Game = require("bitballs/models/game");
var Stat = require("bitballs/models/stat");
var youtubeAPI = require("bitballs/models/youtube");
var platform = require( "steal-platform" );
var $ = require("jquery");

require("./details.less!");
require("bootstrap/dist/css/bootstrap.css!");
require("can/map/define/");
require("can/route/");

/**
 * @constructor bitballs/components/game/details.ViewModel ViewModel
 * @parent bitballs/components/game/details
 *
 * @description  A `<game-details>` component's viewModel.
 */

exports.ViewModel = CanMap.extend(
/**
 * @prototype
 */
{
	define: {
		/**
		 * @property {Promise<bitballs/models/game>|undefined}
		 *
		 * Provides a Game instance with all the stats for the
		 * game and all the player information!
		 *
		 * @signature `Promise<bitballs/models/game>`
		 *
		 *   Given a valid `gameId`, the game promise.
		 *
		 * @signature `undefined`
		 *
		 *   Given an invalid `gameId`, the game promise.
		 *
		 *
		 * @body
		 *
		 * ```
		 * var gameDetailsVM = new GameDetailsViewModel({
		 *   gameId: 5
		 * });
		 * gameDetailsVM.attr("gamePromise").then(function(game){
		 *   game.attr("date") //-> Date
		 * })
		 * ```
		 *
		 */
		gamePromise: {
			get: function() {
				return Game.get({
					id: this.attr("gameId"),
					withRelated: ["stats",
						"tournament",
						"homeTeam.player1",
						"homeTeam.player2",
						"homeTeam.player3",
						"homeTeam.player4",
						"awayTeam.player1",
						"awayTeam.player2",
						"awayTeam.player3",
						"awayTeam.player4"
					]
				});
			}
		},
		/**
		 * @property {bitballs/models/game}
		 * 
		 * Provides a game instance once the game promise resolves.
		 */
		game: {
			get: function(last, set){
				this.attr('gamePromise').then(set);
			}
		},
		/**
		 * @property {Object}
		 * 
		 * The [YouTube Player object](https://developers.google.com/youtube/js_api_reference).
		 */
		youtubePlayer: {
			type: "*"
		},
		/**
		 * @property {Array<{name: String}>}
		 *
		 * Array of statType objects from [bitballs/models/stat]
		 */
		statTypes: {
			value: Stat.statTypes
		},
		/**
		 * @property {Object<{home: Number, away: Number}>}
		 * 
		 * The final score of the game, which is totalled based on the
		 * game stats.
		 */
		finalScore: {
			get: function(){
				var game = this.attr("game");
				if(game && game.attr("stats")) {
					var playerMap = this.attr("playerIdToHomeOrAwayMap");
					var scores = {home: 0, away: 0};
					game.attr("stats").each(function(stat){
						if(stat.attr("type") === "1P") {
							scores[playerMap[ stat.attr("playerId")]]++;
						}
						if(stat.attr("type") === "2P") {
							scores[playerMap[ stat.attr("playerId")]] += 2;
						}
					});
					return scores;
				}
			},
			type:"*"
		},
		/**
		 * @property {Object<{home: Number, away: Number}>}
		 * 
		 * The score of the game at the current time in the video,
		 * which is totalled based on the game stats up to that point.
		 */		
		currentScore: {
			get: function(){
				var game = this.attr("game");
				if(game && game.attr("stats")) {
					var playerMap = this.attr("playerIdToHomeOrAwayMap");
					var scores = {home: 0, away: 0};

					var time = this.attr("time");

					game.attr("stats").each(function(stat){
						if(stat.attr("time") <= time) {
							if(stat.attr("type") === "1P") {
								scores[playerMap[ stat.attr("playerId")] ]++;
							}
							if(stat.attr("type") === "2P") {
								scores[playerMap[ stat.attr("playerId")]] += 2;
							}
						}
					});
					return scores;
				}
			},
			type:"*"
		},
		/**
		 * @property {Object}
		 *
		 * An object mapping each player id to "home" or "away" to enable
		 * totalling of scores based on stats.
		 */
		playerIdToHomeOrAwayMap: {
			type: "*",
			get: function(){
				var game = this.attr("game");
				if(game && game.attr("homeTeam") && game.attr("awayTeam")) {
					var map = {};
					for(var i = 1; i <= 4; i++) {
						map[ game.attr("homeTeam").attr("player"+i+"Id") ] = "home";
						map[ game.attr("awayTeam").attr("player"+i+"Id") ] = "away";
					}
					return map;
				}
			}
		},
		/**
		 * @property {Object}
		 *
		 * An object of stats sorted by player id from [bitballs/models/stat]
		 */
		sortedStatsByPlayerId: {
			type: "*",
			get: function(){
				var game = this.attr("game");
				if(game) {
					return game.sortedStatsByPlayerId();
				}
			}
		}
	},
	/**
	 * @function
	 * @description Displays the stat menu for a particular player and time.
	 * @param  {bitballs/models/player} player The player to show the stat menu for.
	 *
	 * @body
	 *
	 * Use this in a template like:
	 *
	 * ```
	 * <tr ($click)="showStatMenuFor(.,%element, %event)">
	 * ```
	 */
	showStatMenuFor: function(player, element, event){
		if(!this.attr("session") || !this.attr("session").isAdmin()) {
			return;
		}
		var youtubePlayer = this.attr("youtubePlayer");
		var time = youtubePlayer.getCurrentTime();
		youtubePlayer.pauseVideo();


		this.attr("stat", new Stat({
			time: time,
			playerId: player.attr("id"),
			gameId: this.attr("game.id"),
			player: player
		}));
	},
	/**
	 * @function
	 * @description Creates a stat from the stat menu.
	 * @param  {Event} ev The event from the stat menu submission.
	 *
	 * @body
	 * Use in a template like:
	 * ```
	 * <span ($click)="gotoTimeMinus5(time, %event)">
	 * ```
	 */
	createStat: function(ev) {
		ev.preventDefault();
		var self = this;
		var stat = this.attr("stat");


		stat.save(function(){
			self.removeAttr("stat");
		}, function(e){
			console.log(e);
			self.removeAttr("stat");
		});
	},
	/**
	 * @function
	 * @description Remove the currently displayed stat, hiding the stat menu.
	 *
	 * @body
	 * Use in a template like:
	 * ```
	 * <button type="submit" class="btn btn-primary" >Add</button> 
	 * <a class="btn btn-default" ($click)="removeStat()">Cancel</a>
	 * ```
	 */
	removeStat: function(){
		this.removeAttr("stat");
	},
	/**
	 * @function
	 * @description Adds time to the current stat.
	 * @param {Number} time How much to increment the time by.
	 *
	 * @body
	 * Use in a template like:
	 * ```
	 * <div class="col-xs-6">
	 *   <a class="btn btn-default" ($click)="minusTime(10)">-10 s</a>
	 *   <a class="btn btn-default" ($click)="minusTime(2)">-2 s</a>
	 *   <a class="btn btn-default" ($click)="addTime(2)">+2 s</a>
	 *   <a class="btn btn-default" ($click)="addTime(10)">+10 s</a>
	 * </div>
	 * ```
	 */
	addTime: function(time){
		this.attr("stat.time", this.attr("stat.time")+time);
	},
	/**
	 * @function
	 * @description Subtracts time from the current stat.
	 * @param {Number} time How much to decrement the time by.
	 *
	 * @body
	 * Use in a template like:
	 * ```
	 * <div class="col-xs-6">
	 *   <a class="btn btn-default" ($click)="minusTime(10)">-10 s</a>
	 *   <a class="btn btn-default" ($click)="minusTime(2)">-2 s</a>
	 *   <a class="btn btn-default" ($click)="addTime(2)">+2 s</a>
	 *   <a class="btn btn-default" ($click)="addTime(10)">+10 s</a>
	 * </div>
	 * ```
	 */	
	minusTime: function(time){
		this.attr("stat.time", this.attr("stat.time")-time);
	},
	/**
	 * @function
	 * Moves the youtube player to minus 5 seconds for a given time.
	 *
	 * @param  {Number} time
	 *    The time of some event.
	 *
	 * @param  {Event} [event]
	 *    An optional event that's default will be prevented.
	 *
	 * @body
	 *
	 * Use this in a template like:
	 *
	 * ```
	 * <button ($click)="gotoTimeMinus5(stat.time,$event)">
	 * ```
	 */
	gotoTimeMinus5: function(time, event) {
		var player = this.attr("youtubePlayer");
		if (player.seekTo) {
			player.seekTo(time - 5, true);
		}
		if (player.playVideo) {
			player.playVideo();
		}
		if(event) {
			event.stopPropagation();
		}
	},
	/**
	 * @function 
	 * @description Delete a stat from the database.
	 * @param {bitballs/models/stat} stat The [bitballs/models/stat] to delete.
	 * @param {event} event The event that triggered the deletion.
	 *
	 * @body
	 * 
	 * Use in a template like:
	 * ```
	 * <span class="destroy-btn glyphicon glyphicon-trash" ($click)="deleteStat(., %event)"></span>
	 * ```
	 */
	deleteStat: function (stat, event) {
		if (! window.confirm('Are you sure you want to delete this stat?')) {
			return;
		}
		stat.destroy();
		if(event) {
			event.stopPropagation();
		}
	},
	/**
	 * @function 
	 * @description  Get the percentage of total game time for a certain time for positioning stats.
	 * @param  {Number} time The time of the stat.
	 * @return {Number} The percentage through the total game time the current time is.
	 *
	 * @body
	 * 
	 * Use in a template like:
	 * ```
	 * <span style="left: \{{statPercent time}}%">
	 * ```
	 */
	statPercent: function(time){
		var duration = this.attr("duration");
		if(duration) {
			return time() / duration * 100;
		} else {
			return "0";
		}

	},
	/**
	 * @function
	 * @description Gets a list of stats for a player
	 * @param  {String|can.compute<String>} id The id of the player.
	 * @return {can.List} The list of stats for the player.
	 *
	 * @body
	 * 
	 * Use in a template like:
	 * ```
	 * \{{#eachOf statsForPlayerId(id)}}
	 * \{{type}}
	 * \{{/each}}
	 * ```
	 */
	statsForPlayerId: function(id){
		if(typeof id === "function") {
			id = id();
		}
		var statsById = this.attr("sortedStatsByPlayerId");
		if(statsById) {
			return statsById[id] || new List();
		} else {
			return new List();
		}
	}
});

exports.Component = Component.extend({
	tag: "game-details",
	template: require("./details.stache!"),
	viewModel: exports.ViewModel,
	/**
	 * @constructor {can.Component.events} bitballs/components/game/details.events Events
	 * @parent bitballs/components/game/details
	 * 
	 * @description A `<game-details>` component's events object.
	 */
	events: {
		/**
		 * @function
		 * @description Initializes the YouTube player upon insertion.
		 */
		inserted: function(){
			var self = this;
			youtubeAPI().then(function(YT){
				self.YT = YT;
			}).then(function () {
				return self.scope.attr('gamePromise');
			}).then(function () {
				var player = new self.YT.Player('youtube-player', {
					height: '390',
					width: '640',
					videoId: self.scope.attr("game.videoUrl"),
					events: {
					  'onReady': self.onPlayerReady.bind(self),
					  'onStateChange': self.onPlayerStateChange.bind(self)
					}
				});
				self.scope.attr("youtubePlayer", player);
			})["catch"](function(e){
				if ( platform.isNode ) {
					return;
				}
				setTimeout(function(){
					throw e;
				},1);
			});
		},
		/**
		 * @function removed
		 * @description Cleans up after player events.
		 */
		"removed": function(){
			// timeUpdate could be running
			clearTimeout(this.timeUpdate);
		},
		/**
		 * @function
		 * @description The onPlayerReady handler for the YouTube Player.
		 */
		onPlayerReady: function(){
			var youtubePlayer = this.scope.attr("youtubePlayer"),
				self = this;

			//this.scope.attr("youtubePlayer").playVideo();

			// get duration
			var getDuration = function(){
				var duration = youtubePlayer.getDuration();
				if(duration) {
					self.scope.attr("duration", duration);
				} else {
					setTimeout(getDuration, 100);
				}
			};
			getDuration();
		},
		/**
		 * @function
		 * @description The handler for when the YouTube Player state changes.
		 * Updates the time in the viewModel as the time changes in the video.
		 */
		onPlayerStateChange: function(ev){
			var viewModel = this.viewModel,
				player = viewModel.attr("youtubePlayer"),
				self = this;
			var timeUpdate = function(){
				var currentTime = player.getCurrentTime();
				if(viewModel.attr("stat")) {
					viewModel.attr("stat").attr("time", currentTime);
				}
				self.timeUpdate = setTimeout(timeUpdate, 100);
				self.updatePosition(currentTime);
			};


			if(ev.data === self.YT.PlayerState.PLAYING) {
				this.scope.attr("playing", true);
				timeUpdate();
			} else {
				this.scope.attr("playing", false);
				clearTimeout(this.timeUpdate);
			}


		},
		/**
		 * @function
		 * @param  {Number} time The current time.
		 * @description Updates the position of the cursor on the stats container.
		 */
		updatePosition: function(time){
			var duration = this.scope.attr("duration");
			if(duration) {
				this.viewModel.attr("time", time);
				var fraction = time /duration;
				var containers = this.element.find(".stats-container");
				var width = containers.width();
				var firstOffset = containers.first().offset();
				var height = containers.last().offset().top - firstOffset.top + containers.last().height();
				$("#player-pos").offset({
					left: firstOffset.left + fraction*width,
					top: firstOffset.top
				}).height(height);
			}
		},
		/**
		 * @function
		 * @description On time change, update the Youtube Player.
		 */
		"{stat} time": function(){
			var time = this.scope.attr("stat.time");
			if(typeof time === "number" && time >= 0) {

				var player = this.scope.attr("youtubePlayer");
				var playerTime = player.getCurrentTime();
				if(Math.abs(time-playerTime) > 2) {
					player.seekTo(time, true);
				}

			}

		},
		/**
		 * @function
		 * @description  On window resize, update the position of the cursor in the stats container.
		 */
		"{window} resize": function(){
			var player = this.viewModel.attr("youtubePlayer"),
				currentTime;
			if (player.getCurrentTime) {
				currentTime = player.getCurrentTime();
				this.updatePosition(currentTime);
			}
		},
		/**
		 * @function
		 * @description When a stat is added, show the stat menu.
		 */
		"{viewModel} stat": function(vm, ev, newVal){
			setTimeout(function(){
				$("#add-stat").offset( $(".stats-container:first").offset() ).show();
			},1);

		}
	}
});
