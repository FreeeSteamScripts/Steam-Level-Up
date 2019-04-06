module.exports = CustomerHandler;

function CustomerHandler(client, admin, maxDays, helper){
	
	this.client=client;
	this.helper=helper;
	this.finishedTrades={};
	this.Warns={};	
	this.admin=admin;
	this.maxDays=maxDays;
	
	let self=this;
	
	this.helper.getJSON('user_comments.json', data => { this.Comments=data; } );
	
	this.helper.getJSON('usersinteract.json', data => { this.LastInteract=data; } );
	
	this.LastInteract_i = setInterval( () => {
		for(let user in client.myFriends){
			if(client.myFriends[user] == 3 && self.admin.indexOf(user) == -1){
				if(self.LastInteract[user]){
					if(Math.floor(self.helper.Now() - self.LastInteract[user]) > 1000*60*60*24*self.maxDays){
						let response = self.helper.breakline+"Hey, it's been a while since you're have inactive, I'll unfriend you, but if you need anything, just add me again :)";
						response += self.helper.breakline+"Hope i'll see you again, bye!";
						self.Message(user, response);
						self.helper.debug("User #"+user+" has have been inactive for a long time and has been removed from bot friendlist!");
						setTimeout( () => { delete self.LastInteract[user]; self.client.removeFriend(user); }, 2500);								
					}
				} else {
					self.LastInteract[user] = self.helper.Now();
				}
			}
		}
		self.helper.StoreUsersInteract(self.LastInteract, 0);
	}, 1000*60*60);
	
	this.finishedTrades_i = setInterval( () => { 
		for(let time in self.finishedTrades){ 
			if(Math.floor(self.helper.Now() - self.finishedTrades[time]) > 1000*60*5){ 
				delete self.finishedTrades[time]; 
			} 
		} 
	}, 1000*60*60);

}

CustomerHandler.prototype.UserInteract = function(user, type){ 
	let interact = type ? this.Comments : this.LastInteract;
	interact[user] = this.helper.Now(); 
	this.helper.StoreUsersInteract(interact, type); 
}

CustomerHandler.prototype.canComment = function(sid64, callback){
	const u=this.Comments[sid64];
	if(u){
		if(Math.floor(this.helper.Now() - u) > 1000*60*60*12){
			callback(1);
		} else {
			callback(0);
		}
	} else {
		callback(1);
	}
}

CustomerHandler.prototype.Message = function(steamid, msg){ 
	msg = msg.length > 30 ? (this.helper.breakline+msg) : msg;
	this.client.chatMessage(steamid, msg.replace("{breakline}", this.helper.breakline)); 
	this.helper.storeChatLogData(steamid, msg, true);	
}

CustomerHandler.prototype.sendAdminMessages = function(message){ 
	this.admin.forEach( target => { this.Message(target, message); } ); 
}