module.exports = {

	"username":""		//Bot Username
,	"password":""		//Bot Password
,	"identity":""		//Bot Identity Secret
,	"sharedse":""		//Bot Shared Secret

,	"admin":[""]		//Desired admins id 64, one value per quote, splited by comma, example [ "value1", "value2" ]
,	"group":""						//change to "null" witout quotes to disable this feature

,	"ThanksM":"+REP | Thanks for trading with  Level Up !!"	//Desired comment you want the bot to make in customers profile, change to "null" witout quotes to disable this feature
,	"changeBotName":""				//If you want to change bot name on startups, set the value name here, change to "null" witout quotes to disable this feature

,	"maxStock":20		//Max sets amount of any appid bot will accept in your inventory, if bot rearch this limit, wont buy more sets of this appid
,	"maxTradeKeys":30	//Max keys bot will accept in trade using !buy or !sell, this value is for tf and cs:go keys

,	"maxLevelComm":999	//Max level bot will try to calculate using !level
,	"maxDays":30			//Max days an customer can be on friend list without be deleted

,	"enableTF":1		//Enable or disable the TF features here
,	"enablePUBG":0
,	"enableSell":1		//Enable or disable !sell features here
,	"sellmsgs":1		//Enable or disable warning messages in admins steam chata ("hey i just have selled x sets for x keys")

	//Auto Request feature, this will auto request x amount of sets of a target id 64 in every x minutes, usefull if u have 1:1 bot.
,	"request_qty":100						//max amount of sets to request
,	"request_target":"STEAMID64"			//target id64
,	"request_tradelink":""					//target trade-url
,	"request_interval":30					//time interval in minutes
,	"request_ignore":false					//if you want to ignore the maxStock, this value should be true.
,	"request_enable":0						//enable or disable this feature

};
