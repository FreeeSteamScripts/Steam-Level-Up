const KeysAccepted=require('../data/acceptablekeys.json')
const SteamUser = require('steam-user');
const values = typeof Object.values == 'function' ? Object.values : (json) => { let array=[]; for(let val in json){array.push(json[val]);} return array; };

module.exports = Inventory;

function Inventory(community, client, enableTF, enablePUBG, maxStock, helper){
	
	this.community = community;
	this.client = client;
	this.helper = helper;
	this.enableTF = enableTF;
	this.enablePUBG = enablePUBG;
	this.maxStock = maxStock;
	this.apiKey = null;
	this.card_db = null;
	this.loading = 0;	
	
	this.CurrentKeys=[];
	this.CurrentTFKeys=[];
	this.CurrentPUBGKeys=[];
	this.InventoryGemsAssets={};
	
	this.AvailableSets={};		
	
	let self=this;
	
	this.Update_i = setInterval( () => { 
		self.helper.updateTradingCardDb( data => { 
			if(data){
				self.card_db=data;
			} 
		}); 
	}, 1000*60*60*24);
	
};

Inventory.prototype.haveCsKeys = function() { return this.CurrentKeys.length; }

Inventory.prototype.haveSets = function() { return values(this.AvailableSets).reduce( ( prevVal, set ) => { return prevVal + set.length; }, 0 ); }

Inventory.prototype.haveTfKeys = function() { return this.CurrentTFKeys.length; }

Inventory.prototype.havePubgKeys = function() { return this.CurrentPubgKeys.length; }

Inventory.prototype.isInventoryloaded = function(callback) { callback(Object.keys(this.AvailableSets).length + this.haveCsKeys() + this.haveTfKeys()); }

Inventory.prototype.Load = function(force, callback){
	let self=this,
		startedTime = this.helper.Now();
	this.isInventoryloaded( isInvLoaded => {
		if(!isInvLoaded || force) {
				self.helper.log("Loading Bot Inventory..");
				self.loading++;
				self.client.setPersona(SteamUser.EPersonaState.Busy);
				
				let loaded = 0,
					ok = () => {
					if(loaded == 2+self.enableTF){
						self.loading--;
						self.helper.debug(`Inventory loaded in ${(self.helper.Now()-startedTime)/1000} seconds!`);
						callback(1);
					}
					},
					timers={};
				
				function csload(callbacka){
					self.loadCSGOInventory( err => {
						if(err){
							if(err.message.toLowerCase().indexOf("failure") > -1){
								self.helper.logError("This account doesn't have an CS:GO Inventory, please make one first.", "Fatal error");
							} else {
								timers['cs_time'] = setTimeout(() => { csload(callbacka); }, 1000);
							}
						} else {
							loaded++;
							if(callbacka){ callbacka(); }
						} 
					});
				}
				
				function tfload(callbackb){
					self.loadTF2Inventory( err => {
						if(err){
							if(err.message.toLowerCase().indexOf("failure") > -1){
								self.helper.warn("This account doesn't have an TF Inventory, TF'll be disabled!");
								self.enableTF = 0;
								if(callback){ callbackb(); }
							} else {
								timers['tf_time'] = setTimeout(() => { tfload(callbackb); }, 1000);								
							}
						} else {
							loaded++;
							if(callback){ callbackb(); }
						}						
					});
				}
				
				function pubgload(callbacka){
					self.loadPUBGInventory( err => {
						if(err){
							if(err.message.toLowerCase().indexOf("failure") > -1){
								self.helper.logError("This account doesn't have an PUBG Inventory, please make one first.", "Fatal error");
							} else {
								timers['pubg_time'] = setTimeout(() => { csload(callbacka); }, 1000);
							}
						} else {
							loaded++;
							if(callbacka){ callbacka(); }
						} 
					});
				}
				
				function invload(callbackc){
					self.loadInventory( err => {
						if(err){
							self.helper.logError(err.message, "loadInventory");
							timers['card_time'] = setTimeout(() => { invload(callbackc); }, 1000);						
						} else {
							loaded++;
							if(callbackc){ callbackc(); }
						}
					});
				}
				
				if(self.enableTF){ 
					tfload( () => {
						pubgload(ok);
						csload(ok); 
						invload(ok); 
					} ); 
				} else {
					pubgload(ok);
					csload(ok);
					invload(ok);
				}
								
		} else {
			if(callback){ callback(0); }
		}
	});
}


Inventory.prototype.loadInventory = function(callback){ 
	let self=this;
	this.community.getUserInventoryContents(self.ID64, 753, 6, true, (err, items) => {
		if(err){ if(callback){ callback(err); } }
		else {
			let gemsQty = 0,
				InventoryCardsGame={}; 
			self.InventoryGemsAssets={};
			
			let cards = items.filter( item => { 
				if(item.getTag("item_class").internal_name == "item_class_2" && item.getTag("cardborder").internal_name == "cardborder_0"){ 
					return item;
				} 		
			});
			
			cards.forEach( item => {
				let appid=item.market_hash_name.split("-")[0];
				if(!InventoryCardsGame[appid]){ 
					InventoryCardsGame[appid] = {}; 
				}
				if(!InventoryCardsGame[appid][item.market_hash_name]){ 
					InventoryCardsGame[appid][item.market_hash_name] = []; 
				}
				InventoryCardsGame[appid][item.market_hash_name].push(item);
			});
			
			let gems = items.filter( item => { 
				if(item.market_hash_name.toLowerCase().indexOf("753-gems") > -1){ 
					return item;
				} 	
			}); 
			
			gems.forEach( item => {
				self.InventoryGemsAssets[item.id] = item.amount;	
				gemsQty += item.amount;				
			});

			let loginfo=`Found ${self.helper.nFormat(cards.length)} cards`;
			if(gemsQty > 0){ loginfo +=`, and ${self.helper.nFormat(gemsQty)} Gems on inventory!`; } else { loginfo +=' on inventory!'; }
			self.helper.log(loginfo);
			
			self.UpdateSets(InventoryCardsGame, sets => {
				self.helper.log(`Found ${self.helper.nFormat(sets)} card sets !`);
				if(callback){ callback(); }
			});
		}
	});
}

Inventory.prototype.loadCSGOInventory = function(callback){ 
	let self=this;
	this.return_CustomerCSGOKeys(self.ID64, (err, keys) => { if(!err){ self.CurrentKeys = keys; self.helper.log(`Found ${keys.length} CS:GO Keys!`);  if(callback) { callback(); } } else {  if(callback) { callback(err); } } });
}

Inventory.prototype.loadTF2Inventory = function(callback){ 
	let self=this;
	this.return_CustomerTFKeys(self.ID64, (err, keys) => {
			if(err){ if(callback) { callback(err); } }
			else { self.CurrentTFKeys = keys; self.helper.log(`Found ${keys.length} TF Keys!`); if(callback) { callback(); } }
	});
}

Inventory.prototype.loadPUBGInventory = function(callback){ 
	let self=this;
	this.return_CustomerPUBGKeys(self.ID64, (err, keys) => {
			if(err){ if(callback) { callback(err); } }
			else { self.CurrentPUBGKeys = keys; self.helper.log(`Found ${keys.length} PUBG Keys!`); if(callback) { callback(); } }
	});
}

Inventory.prototype.return_CustomerCSGOKeys = function(sid64, callback){
	this.community.getUserInventoryContents(sid64, 730, 2, true, (err, items) => {
		if(err){ callback(err); }
		else {
			items = items.filter( item => { if(KeysAccepted.indexOf(item.market_hash_name) > -1) { return item; } } );
			callback(null, items.map( item => item.assetid ) );
		}
	});
}

Inventory.prototype.return_CustomerTFKeys = function(sid64, callback){
	this.community.getUserInventoryContents(sid64, 440, 2, true, (err, items) => {
		if(err){ callback(err); }
		else {
			items = items.filter( item => { if(item.market_hash_name.indexOf("Mann Co. Supply Crate Key") > -1) { return item; } } );
			callback(null, items.map( item => item.assetid ) );
		}
	});
}

Inventory.prototype.return_CustomerPUBGKeys = function(sid64, callback){
	this.community.getUserInventoryContents(sid64, 578080, 2, true, (err, items) => {
		if(err){ callback(err); }
		else {
			items = items.filter( item => { if(item.market_hash_name.indexOf("EARLY BIRD KEY" , "WEAPON SKIN KEY") > -1) { return item; } } );
			callback(null, items.map( item => item.assetid ) );
		}
	});
}

Inventory.prototype.checkGamesSetInfo = function(InventoryCardsGame, appIds, callback){
	let self=this;	
	if(appIds.length){
		self.AvailableSets={};
		let checked=0,
			done = () => { checked++; if(checked == appIds.length){ callback(); } };
		appIds.forEach( appId => { self.checkGameSet(InventoryCardsGame, appId , () => { done(); });  });	
	} else {
		callback();
	}	
}

Inventory.prototype.checkGameSet = function(InventoryCardsGame, gameApp, callback){
	let self=this;
	if(this.card_db[gameApp]){
		if(Object.keys(InventoryCardsGame[gameApp]).length == self.card_db[gameApp]){
			let max = Math.min.apply( Math, values( InventoryCardsGame[gameApp] ).map( card => card.length ) );
			
			self.AvailableSets[gameApp] = [];
			
			for (let i=0;i<max;i++) {
				 let currentSet=[];
				 for(let key in InventoryCardsGame[gameApp]){ 
					currentSet.push(InventoryCardsGame[gameApp][key][i]);
				 }
				 self.AvailableSets[gameApp].push(currentSet);
			}
			 callback();
		} else {
			callback();
		}
	} else {
		self.getAppIdCount(gameApp, 1);
		callback();
	}
}

Inventory.prototype.UpdateSets = function(InventoryCardsGame, callback){ 
	let self=this;
	this.checkGamesSetInfo(InventoryCardsGame, Object.keys(InventoryCardsGame), () => { callback(self.haveSets()); });
}

Inventory.prototype.return_GemsQty = function() { return values(this.InventoryGemsAssets).reduce( ( prevVal, gem ) => prevVal + gem, 0 ); }

Inventory.prototype.getToOffer_TF_Keys = function(qty, callback) { this.getToOfferKeys(this.CurrentTFKeys, qty, 440, send => { callback(send); });	}

Inventory.prototype.getToOffer_PUBG_Keys = function(qty, callback) { this.getToOfferKeys(this.CurrentPUBGKeys, qty, 578080, send => { callback(send); });	}

Inventory.prototype.getToOffer_CS_Keys = function(qty, callback) { this.getToOfferKeys(this.CurrentKeys, qty, 730, send => { callback(send); }); }

Inventory.prototype.getToOfferSets = function(Keys, qty, callback){
	let send=[];
	for(let b=0;b<qty;b++){ 
		send.push(Keys[b]); 
	}
	callback(send);
}

Inventory.prototype.getToOfferKeys = function(Keys, qty, appid, callback){
	let send=[];
	for(let b=0;b<qty;b++){ 
		send.push({ appid:appid, contextid:2, amount:1, assetid: Keys[b] }); 
	}
	callback(send);
}

Inventory.prototype.getGems = function(qty, callback) { this.getCustomerGems(this.InventoryGemsAssets, qty,  (Gemsqty) => { callback(Gemsqty); }); }

Inventory.prototype.getCustomerGemAssets = function(target, callback){
	this.community.getUserInventoryContents(target, 753, 6, true, (err, items) => {
		if(err){
			callback(err);
		} else {
			let UserGemsAssets={},
				UserGemsQty=0,
				gems = items.filter( item => { if(item.market_hash_name.toLowerCase().indexOf("753-gems") > -1){ return item; } } );
			
			gems.forEach( item => {
				if(!UserGemsAssets[item.id]){
					UserGemsAssets[item.id] = 0;
				}
				UserGemsAssets[item.id] += parseInt(item.amount);
				UserGemsQty += parseInt(item.amount);
			});
			
			callback(null, UserGemsAssets, UserGemsQty);
		}						
	});
}

Inventory.prototype.getAppIdCount = function(AppId, side){
	let self=this;
	this.helper.debug(`Getting #${AppId} sets database`);
	this.community.marketSearch({"Game":`app_${AppId}`, appid:753, "cardborder":"cardborder_0", "item_class":"item_class_2"}, (err, items) => {
		if(err){
			self.helper.debug(`Error in get #${AppId} count with reason: ${err.message}, retrying in 60 seconds..`);
			setTimeout( () => { self.getAppIdCount(AppId); }, 1000*60);
		} else {
			const count = items.length; 
			self.helper.non_market[AppId] = count;
			self.card_db = Object.assign(self.card_db, self.helper.non_market);
			if(side){ self.loadInventory(); }
			self.helper.storeData('nonmarketable_db.json', self.helper.non_market, 1);
			self.helper.debug(`Successfuly updated #${AppId} sets database`);
		}
	});
}

Inventory.prototype.getCustomerGems = function(Assets, qty,  callback){
	let GemsSelected=0,
		toGive=[];
	for(let key in Assets){
		let GemAssetQty = Assets[key],
			GemAsset=key,
			falta = qty - GemsSelected;
		if(GemAssetQty >= falta && falta > 0){
			toGive.push({ appid:753, contextid:6, amount:falta, assetid: GemAsset });
			GemsSelected+=falta;
		}
		else if(GemAssetQty < falta && falta > 0){
			toGive.push({ appid:753, contextid:6, amount:GemAssetQty, assetid: GemAsset });
			GemsSelected+=GemAssetQty;
		}
	}
		callback(toGive);
}

Inventory.prototype.getCustomerSets = function(ignore, sid64, callback, permit){
	let self=this;
	this.community.getUserInventoryContents(sid64, 753, 6, true, (err, items) => {
			if(err){
				callback(err); 
			}
			else {
				
				items = items.filter(item => {
					if(item.getTag("item_class").internal_name == "item_class_2" && item.getTag("cardborder").internal_name == "cardborder_0"){ 
						return item;
					}
				});
				
				let customer_sets=[],
					customer_cards={};
				
				items.forEach( card => {
					const appid=card.market_hash_name.split("-")[0];
					if(!customer_cards[appid]){customer_cards[appid]={};}
					if(!customer_cards[appid][card.market_hash_name]){customer_cards[appid][card.market_hash_name]=[];}
					customer_cards[appid][card.market_hash_name].push(card);
				});

				for(let appid in customer_cards){
					if(self.card_db[appid]){
						if(Object.keys(customer_cards[appid]).length == self.card_db[appid]){
							
							let customerHave = Math.min.apply( Math, values(customer_cards[appid]).map( card => card.length ) ),
								botHave = self.AvailableSets[appid] ? self.AvailableSets[appid].length : 0,
								limit = permit ? (self.maxStock+permit) : self.maxStock,
								falt = limit-botHave;
							
							customerHave = !ignore ? ( (falt > 0) ? ( Math.min( ...[ falt, customerHave ]  ) ) : 0 ) : customerHave;
							
							for (let i=0;i<customerHave;i++) {
								let currentCustomerSet=[]
								for(let card in customer_cards[appid]){
									currentCustomerSet.push(customer_cards[appid][card][i]);
								}
								customer_sets.push(currentCustomerSet);
							}
						}
					} else {
						self.getAppIdCount(appid);
					}					
				}
				callback(null, customer_sets);
			}
		});
}

Inventory.prototype.getUserBadges = function(target, compare, mode, callback){
	let self=this;
	this.client._apiRequest("GET", "IPlayerService", "GetBadges", 1, {"steamid":target, "key":self.apiKey}, (err, r) => {
		if(err){ callback(err); } 
		else {
			if(compare){
				const badges=r.response.badges;
				if(badges && Object.keys(badges)){
					let badge={};
					for(let key in badges){
						const current_badge=badges[key],
							appid=current_badge.appid,
							lvl=parseInt(current_badge.level);
						if(appid && current_badge.border_color == 0){ badge[appid] = (mode == 1) ? (lvl ? 0 : 1) : (5-lvl); badge[appid] = badge[appid] < 0 ? null :  badge[appid]; }							
					}
					callback(null, badge, parseInt(r.response.player_level), parseInt(r.response.player_xp));
				} else {
					callback({message:"empty"});
				}				
			} else {
				if(!r.response.player_level){
					callback({message:"empty"});
				} else {
					callback(null, {}, parseInt(r.response.player_level), parseInt(r.response.player_xp));
				}			
			}	
		}					
	});
}

Inventory.prototype.getAvailableSetsForCustomer = function(target, compare, mode, max, callback){
	let self=this;
	if(compare){ 
		self.getUserBadges(target, compare, mode, (err, badge) => {
			if(err){
				callback(err);
			} else {
				let toSend=[],
					falta = () => max-toSend.length;
				
				for(let appid in self.AvailableSets){
					let available_qty=0;
					available_qty += Math.min( ...[ self.AvailableSets[appid].length, (badge[appid] != null ? badge[appid] : mode ) ] ); 
					
					if(available_qty && falta()){
						for(let i=0;i<available_qty;i++){
							if(falta()){
								toSend.push(self.AvailableSets[appid][i]);
								if(!falta()){
									break; 
								}
							}
						}
					}		
				}
				callback(null, toSend);
			}
		});
	} else {
		let toSend=[],
			falta = () => max-toSend.length;
		
		for(let appid in self.AvailableSets){
			let available_qty=Math.min( ...[ self.AvailableSets[appid].length, 5 ] );
			
			if(available_qty && falta()){
				for(let i=0;i<available_qty;i++){
					if(falta()){
						toSend.push(self.AvailableSets[appid][i]);
						if(!falta()){
							break; 
						}
					}
				}
			}		
		}
		callback(null, toSend);
	}
}