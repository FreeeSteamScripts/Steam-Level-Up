const fs = require('fs'),
    request = require('request'),
    SteamTotp = require('steam-totp'),
    colour = require('colour'),
    enableColors = /^win/.test(process.platform);
 
module.exports = Helper;
 
module.exports.getConfig = () => fs.existsSync(`${process.cwd()}/data/config.js`) ? require('./data/config.js') : require('./data/config.json');
 
function Helper(){
    this.debug_mode = false;
    this.breakline = require('os').EOL;
   
    this.getJSON('nonmarketable_db.json', data => {
        this.non_market=data;
        this.debug(`There are currently ${Object.keys(data).length} games on unmarketable database.`);
    });
}
Helper.prototype.sets_db = function(callback){
    let self=this;
    this.getJSON('database.json', data => {        
        if(Object.keys(data).length){
            callback( Object.assign(data, self.non_market) );
        } else {
            callback(null);
        }      
    });
}      
 
Helper.prototype.saveFile = function(dir, filename, content, f = 'a'){
    try {
        fs.writeFile(dir+filename, content, { flag: f }, err => {
            if(err){
                if(err.code == `ENOENT`){
                    this.createPath(dir, () => {
                        this.saveFile(dir, filename, content, f);
                    });
                }
               
                else if(err.code == `EMFILE`){
                    setTimeout( () => {
                        this.saveFile(dir, filename, content, f);
                    }, 1000);
                }
               
                else {
                    throw err;
                }
            }
        });
    } catch(e) {
        this.debug(`saveFile ${dir+filename} Failed`, false);
        setTimeout( () => {
            this.saveFile(dir, filename, content, f);
        }, 1000);      
    }
}
 
Helper.prototype.debug =  function(msg, json){
    const time = this.CurDateTime();
    if(json){
        this.storeDebugData(`${time} - > ${JSON.stringify(msg)}\r\n`);
        if(this.debug_mode){
            const text = `${time} DEBUG - > ${JSON.stringify(msg)}`;
            console.log(enableColors ? colour.grey(text) : text);
        }
    } else {
        this.storeDebugData(`${time} - > ${msg}\r\n`);
        if(this.debug_mode){
            const text = `${time} DEBUG - > ${msg}`;
            console.log(enableColors ? colour.grey(text) : text);
        }
    }
 
}
 
Helper.prototype.storeDebugData = function(data){
    this.saveFile(`${process.cwd()}/history/`, `debug.log`, data);
}
 
Helper.prototype.storeData = function(filename, data, json){
    this.saveFile(`${process.cwd()}/data/`, filename, json ? JSON.stringify(data) : data, `w`);
}
 
Helper.prototype.CurDateTime = function(){
    const m = new Date();
    return  m.getFullYear() + "-" +
    ("0" + (m.getMonth()+1)).slice(-2) + "-" +
    ("0" + m.getDate()).slice(-2) + " " +
    ("0" + m.getHours()).slice(-2) + ":" +
    ("0" + m.getMinutes()).slice(-2) + ":" +
    ("0" + m.getSeconds()).slice(-2);
}
 
Helper.prototype.log = function(data){
    const
        time = this.CurDateTime(),
        text = `${time} INFO - > ${data}`;
   
    console.log(enableColors ? colour.cyan(text) : text);
    this.storeLogData(`[${time.split(" ")[1]}] ${data}\r\n`, `${process.cwd()}/history/log`);
}
 
Helper.prototype.storeLogData = function(data, filePath){
    const time = this.CurDateTime();
    this.saveFile(`${filePath}/`, `${time.split(" ")[0]}.log`, data);
}
 
Helper.prototype.warn = function(data){
    const
        time = this.CurDateTime(),
        text = `${time} WARN - > ${data}`;
 
    console.log(enableColors ? colour.yellow(text) : text);
   
    this.storeLogData(`[${time.split(" ")[1]}] ${data}\r\n`, `${process.cwd()}/history/log`);
}
 
Helper.prototype.logError = function(data, event){
    const
        time = this.CurDateTime(),
        text = `${time} ERROR - >  ${event ? `${event}: ${data}` : data}`;
 
    console.log(enableColors ? colour.red(text) : text);
 
    this.storeLogData(`[${time.split(" ")[1]}] ${data}\r\n`, `${process.cwd()}/history/error`);
}
 
Helper.prototype.logTrade = function(data){
    const
        time = this.CurDateTime(),
        text = `${time} TRADE - >  ${data}`;
   
    console.log(enableColors ? colour.green(text) : text);
   
    this.storeLogData(`[${time.split(" ")[1]}] ${data}\r\n`, `${process.cwd()}/history/trade`);
}
 
Helper.prototype.createPath = function(filePath, callback) {
    fs.mkdir(filePath, err => {
        if(!err){
            callback();
        } else {
            if(err.code == `EEXIST`){
                callback();
            } else {
                setTimeout( () => {
                    this.createPath(filePath, callback);
                }, 1000);
            }
        }
    });
}
 
Helper.prototype.getCode = function(shared, callback){
    SteamTotp.getTimeOffset( (err, offset) => {
        callback(SteamTotp.generateAuthCode(shared, offset));
    });
}
 
Helper.prototype.updateTradingCardDb = function(callback){
    this.debug("Updating card sets Database..");
    request("http://cdn.steam.tools/data/set_data.json", { json: true }, (err, r, body) => {
        if (!err && r.statusCode == 200 && body) {
            let data = {};
            body.sets.forEach( set => { data[set.appid] = set.true_count; });
            this.storeData('database.json', data, 1);
            this.debug(`Sets Database up to date!, Found ${body.sets.length} appids!`);
            callback( Object.assign(data, this.non_market) );
        } else {
            this.debug("Error in request new sets database, loading local database..");
            this.sets_db( db => { if(db){callback(db);} else {this.logError(`Error in load Sets DB! Reason: ${err.message}`, 'updateTradingCardDb');callback(null);} });
        }
    });
}
 
Helper.prototype.getLevelExp = function(level){
    const ExpForLevel = tl => Math.ceil(tl / 10) * 100;
    let exp = 0;
   
    for(let i=0;i<level+1;i++){
        exp += ExpForLevel(i);
    }
 
    return exp;
}
 
Helper.prototype.nFormat = function(number, decimals, decPoint, thousandsSep){
    decimals = decimals || 0;
    number = parseFloat(number);
 
    if(!decPoint || !thousandsSep){ decPoint = '.'; thousandsSep = ','; }
 
    let roundedNumber = Math.round( Math.abs( number ) * ('1e' + decimals) ) + '',
        numbersString = decimals ? roundedNumber.slice(0, decimals * -1) : roundedNumber,
        decimalsString = decimals ? roundedNumber.slice(decimals * -1) : '',
        formattedNumber = "";
 
    while(numbersString.length > 3){
        formattedNumber += thousandsSep + numbersString.slice(-3)
        numbersString = numbersString.slice(0,-3);
    }
 
    return (number < 0 ? '-' : '') + numbersString + formattedNumber + (decimalsString ? (decPoint + decimalsString) : '');
}
 
Helper.prototype.storeChatLogData = function(source, message, me){
    const time = this.CurDateTime();
    this.saveFile(`${process.cwd()}/history/chat/${time.split(" ")[0]}`, `${source}.log`, `[${time.split(" ")[1]}] ${me ? `Bot` : `User`} : ${message}\r\n`);
}
 
Helper.prototype.StoreUsersInteract = function(LastInteract, type){
    if(type){
        this.storeData('user_comments.json', LastInteract, 1);
    } else {
        this.storeData('usersinteract.json', LastInteract, 1);
    }
}
 
Helper.prototype.getJSON = function(filename, callback){
    if (fs.existsSync(`${process.cwd()}/data/${filename}`)) {
        const file = fs.readFileSync(`${process.cwd()}/data/${filename}`);
        try {  
            const json = JSON.parse(file);
            callback(json);
        } catch(e) {
            this.debug(`Tryed to parse a wrong JSON string [data/${filename}]`);
            callback({});
        }
    } else {
        callback({});
    }
}
 
Helper.prototype.getLogOn = function(login, pw) { return {"accountName": login, "password": pw, "rememberPassword":true}; }
 
Helper.prototype.fixNumber = (number, x) => parseFloat(number.toFixed(x));
 
Helper.prototype.Now = () => new Date().getTime();