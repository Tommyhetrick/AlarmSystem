// Alarm System Script By Tom Hetrick Jr.
// https://github.com/Tommyhetrick/AlarmSystem
const fs = require('fs');
const express = require('express');
const { exec } = require('child_process');
const { SSL_OP_TLS_BLOCK_PADDING_BUG } = require('constants');
const inkjet = require('inkjet');
const { stderr, stdout } = require('process');
require('dotenv').config();
const app = express();
const rootDir = "/home/pi/alarm";
const usesDongle = true;
const useIFTTT = true;
const plugWait = 60;
const useWebcam = true;
const archiveWebcam = true;
const port = 80;
const soundLength = 3;
const camThreshold = 325000;
const unmodifyDays = 3;
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

var alarmRunning = false;
var systemActive = true;
var debugMode = false;
var previousData = [];
var cancelled = false;
var photoID = '';
var photoIDTimer = 0;
var webcamCooldown = 0;
var modifiedData = [
    [false,0],
    [false,0],
    [false,0],
    [false,0],
    [false,0],
    [false,0],
    [false,0]
];
var settings = {
    debugLogTime: {
        value: false,
        label: "Log time in debug"
    },
    soundOn: {
        value: true,
        label: "Sound On"
    }
};

// ALARM TIMES
var alarmData = [

    // sunday
    {
        hours: 11,
        minutes: 0
    },
    // monday
    {
        hours: 10,
        minutes: 15
    },
    // tuesday
    {
        hours: 6,
        minutes: 25
    },
    // wednesday
    {
        hours: 10,
        minutes: 15
    },
    // thursday
    {
        hours: 8,
        minutes: 50
    },
    // friday
    {
        hours: 11,
        minutes: 0
    },
    // saturday
    {
        hours: 11,
        minutes: 0
    }
];

const origAlarmData = JSON.parse(JSON.stringify(alarmData));
// event (memories) data. end with a period
const eventData = [
    {
        desc: "This alarm was created.",
        year: 2020,
        month: "September",
        day: 20
    }
// the rest were redacted
];

// -- Script start --

// express server stuff
app.listen(port, () => {
    log(`Express app listening at http://localhost:${port}`);
});

app.get('/', function (req, res) {
    na = getNextAlarm();
    nAlarmUnix = na.nAlarmUnix;
    cancelledDOTW = na.cancelledDOTW;
    tempToday = na.tempToday;  
    if (systemActive) {
        toggleBtnTxt = "Turn System Off";
        backgroundClr = "white";
        activeText = "Alarm System is active";
        hideableObj = "";
        toggleRestyle = "";
        disableCountdown = false;
    } else {
        toggleBtnTxt = "Turn System On";    
        backgroundClr = "#FF4C4C";  
        activeText = "Alarm System is inactive";
        hideableObj = "style='display:none'";
        disableCountdown = true;
        toggleRestyle = `
        #toggle {
          width: 10%;
          height: 8%;
        } 
        `;
    }

    if (debugMode) {
        toggleDebugTxt = "Disable Debug Mode";
    } else {
        toggleDebugTxt = "Enable Debug Mode";     
    }

    if (alarmRunning) {
        stopBtnMod = "style='background-color: white;'";
    } else {
        stopBtnMod = "style='background-color: rgb(127,127,127);'";
    }

    var dispTimes = JSON.parse(JSON.stringify(alarmData));

    for (var i=0;i<dispTimes.length;i++) {
        let amPm = "AM";
        if (dispTimes[i].hours >= 12) {
            if (dispTimes[i].hours != 12) {
                dispTimes[i].hours -= 12;
            }
            amPm = "PM";
        }

        // special case for midnight
        if (amPm == "AM" && dispTimes[i].hours == 0) {
            dispTimes[i].hours = 12;
        }

        // get countdown of auto reset modified
        if (debugMode && modifiedData[i][0]) {
            modifyTimeConsts = [86400,3600,60];
            modifyUnixDiff = (unmodifyDays*24*60*60) - ((new Date().getTime() - modifiedData[i][1])/1000);
            modifyDays = Math.floor(modifyUnixDiff/modifyTimeConsts[0]);
            modifyUnixDiff -= modifyDays * modifyTimeConsts[0];
            modifyHours = Math.floor(modifyUnixDiff/modifyTimeConsts[1]);
            modifyUnixDiff -= modifyHours * modifyTimeConsts[1];      
            modifyMinutes = Math.floor(modifyUnixDiff/modifyTimeConsts[2]);
            modifyUnixDiff -= modifyMinutes * modifyTimeConsts[2];      
            modifyCountdown = " " + formatDNum(modifyDays) + ":" + formatDNum(modifyHours) + ":" + formatDNum(modifyMinutes) + ":" + formatDNum(Math.floor(modifyUnixDiff));
        } else {
            modifyCountdown = "";
        }
        dispTimes[i].minutes = formatDNum(dispTimes[i].minutes);
        dispTimes[i] = (modifiedData[i][0] ? " style='color:red'" : "") + ">" + dispTimes[i].hours + ":" + dispTimes[i].minutes + " " + amPm + modifyCountdown;
    };

    //send back homepage
    res.send(`
    <head>
    <title>Alarm System</title>
    </head>
    <h1>${activeText}</h1>
    <br>
    
    <input type="button" id="stop" value="Stop" onclick="document.location.href='./stop'" ${hideableObj} ${stopBtnMod}>
    <br><br>
    <input type="button" id="force" ${hideableObj}>
    <input type="button" id="cancel" value="Cancel Status" onclick="document.location.href='./cancel'" ${hideableObj}>
    <input type="button" id="Modify" ${hideableObj} value="Modify Next" onclick="document.location.href='./modify'">
    <input type="button" id="test">
    <input type="button" id="cam" ${hideableObj} value="Camera" onclick="document.location.href='./cam'">
    <input type="button" id="settings" value="Settings" onclick="document.location.href='./settings'">
    <br>
    <p id="countdown" ${hideableObj}></p>
    <br>
    <br>
    <br>
    <br>
    <input type="button" id="toggle" value="${toggleBtnTxt}" onclick="document.location.href='./toggle'">
    <br>
    <br>
    <br>
    <br>
    <br>
    <br>
    <input type="button" id="debugMode" value="${toggleDebugTxt}" onclick="document.location.href='./debug'">
    <br><br><br>
    <table style="width:16%;margin-left: 42%;">
        <tr>
            <th>Day Of The Week:</th>
            <th>Time</th>
        </tr>
        <tr>
            <td>Sunday</td>
            <td${dispTimes[0]}</td>
        </tr>
        <tr>
            <td>Monday</td>
            <td${dispTimes[1]}</td>
        </tr>
        <tr>
            <td>Tuesday</td>
            <td${dispTimes[2]}</td>
        </tr>
        <tr>
            <td>Wednesday</td>
            <td${dispTimes[3]}</td>
        </tr>
        <tr>
            <td>Thursday</td>
            <td${dispTimes[4]}</td>
        </tr>
        <tr>
            <td>Friday</td>
            <td${dispTimes[5]}</td>
        </tr>
        <tr>
            <td>Saturday</td>
            <td${dispTimes[6]}</td>
        </tr>
    </table>
    <style>
        * {
            text-align: center;
        }
        body {
            background-color: ${backgroundClr};
        }
	    #stop {
	        width: 13%;
	        height: 7%;
            font-size: 20pt;
        }

        ${toggleRestyle}
    </style>
    
    <script>

    function resetForce() {
        document.getElementById('force').value = "Force Start";
        document.getElementById('force').onclick = () => {
            document.getElementById('force').value = "Press Again to Start";
            document.getElementById('force').onclick = () => {
                document.location.href='./force';
            }
            setTimeout(resetForce,5000);
        };    
    }

    function resetTest() {
        document.getElementById('test').value = "Test Sound";
        document.getElementById('test').onclick = () => {
            document.getElementById('test').value = "Press Again to Test";
            document.getElementById('test').onclick = () => {
                document.location.href='./test';
            }
            setTimeout(resetTest,5000);
        };    
    }

    function updateCountdown() {
        var cancelled = ${cancelled};
        var nAlarmUnix = ${nAlarmUnix};
        var cancelledDOTW = "${cancelledDOTW}";
        diff = nAlarmUnix - new Date().getTime();
        nextAlarm = "Next Alarm (${days[tempToday.getDay()]}) : ";
        if (diff <= 0) {
            nextAlarm += "Now!";
            document.getElementById('stop').style = "background-color: white";
        } else {
            diff /= 1000;
            hours = Math.floor(diff / 3600);
            diff -= hours * 3600;
            minutes = Math.floor(diff / 60);
            diff -= minutes * 60;
            diff = Math.floor(diff);
            hours = (hours.toString().length == 1) ? 0 + hours.toString() : hours; 
            minutes = (minutes.toString().length == 1) ? 0 + minutes.toString() : minutes; 
            diff = (diff.toString().length == 1) ? 0 + diff.toString() : diff; 
            nextAlarm += hours+":"+minutes+":"+diff;
        }
        if (cancelled) {
            nextAlarm += "<br>(" + cancelledDOTW + " was cancelled)";
        }
        document.getElementById('countdown').innerHTML = nextAlarm;
        setTimeout(updateCountdown,20);
    }
    resetForce();
    resetTest();
    if (!${disableCountdown}) {
        updateCountdown();
    }
    </script>
    `);     
});

// -- Stop Page --
app.get('/stop', function (req, res) {
    if (alarmRunning) {
        alarmRunning = false;
        setTimeout(plugControl,(plugWait*1000),false);
        archiveCam();
        log('Alarm Was stopped. Starting TTS...');
        res.send(`
        <head><title>Alarm System</title></head>
        <h1>Alarm has been stopped.</h1>
        <br><br>
        <input type="button" value="Back" onclick="document.location.href = \'../\'">
        <script>
            setTimeout(() => {
                document.location.href = "../";
            },2500);
        </script>
        `);
        if (settings.soundOn.value) {
            setTimeout(runTTS(),soundLength);
        }
    } else {
        log('Alarm stopping webserver accessed, but alarm was already stopped');
        res.send(`
        <head><title>Alarm System</title></head>
        <h1>Alarm was already stopped. :)</h1>
        <br><br>
        <input type="button" value="Back" onclick="document.location.href = \'../\'">
        <script>
            setTimeout(() => {
                document.location.href = "../";
            },1500);
        </script>
        `);     
    }
});

// -- Force Start Page --
app.get('/force', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    if (systemActive) {
        if (!cancelled) {
            alarmRunning = true;
            plugControl(true);
            webcamCooldown = 3;
            log('Alarm Was Forced to start through webserver');
            res.send(`
            <head><title>Alarm System</title></head>
            <h1>Alarm has been forced to start.</h1>
            <br><br>
            <input type="button" value="Back" onclick="document.location.href = \'../\'">
            <script>
                setTimeout(() => {
                    document.location.href = "../";
                },2500);
            </script>
            `);
        } else {
            cancelled = false;
            log('Alarm Was Forced to start through webserver, but alarm was set to cancel');
            res.send(`
            <head><title>Alarm System</title></head>
            <h1>You tried to force the alarm to start, but it was set to be cancelled.</h1>
            <br><br>
            <input type="button" value="Back" onclick="document.location.href = \'../\'">
            <script>
                setTimeout(() => {
                    document.location.href = "../";
                },1500);
            </script>
            `);
        }
    } else {
        log('Alarm Was Forced to start through webserver, but system is inactive');  
        res.send(`
        <head><title>Alarm System</title></head>
        <h1>You tried to force the alarm to start, but the system is inactive</h1>
        <br><br>
        <input type="button" value="Back" onclick="document.location.href = \'../\'">
        <script>
            setTimeout(() => {
                document.location.href = "../";
            },1500);
        </script>
        `);
    }
});

// -- Cancel Page --
app.get('/cancel', function (req, res) {
    if (cancelled) {
        cancelledString = "Next Alarm Is Cancelled";
        buttonLink = "/cancel/false";
        buttonText = "Uncancel";
    } else {
        cancelledString = "Next Alarm Will Occur As Usual";
        buttonLink = "/cancel/true";
        buttonText = "Cancel";
    }
    // cancels control page
    res.send(`
        <head><title>Alarm System</title></head>

        <style>
            * {
                text-align: center;
            }
            #cancelBtn {
                width: 10%;
                height: 5%;
                font-size: 15pt;
            }

            #backBtn {
                width: 5%;
                height: 3%;
            }
        </style>
        <br>
        <h2>Status: ${cancelledString}<h2> <input id="cancelBtn" type="button" value="${buttonText}" onclick="document.location.href='${buttonLink}'"><br><br>
        <input  id="backBtn" type="button" value="Back" onclick="document.location.href = '../'">
    `);
});

// -- Settings Page --
app.get('/settings', function (req, res) {
    pageData = "";
    for (var i=0;i<Object.keys(settings).length;i++) {
        pageData += settings[Object.keys(settings)[i]].label + " : " + settings[Object.keys(settings)[i]].value + "<br>";
        pageData += `<input  id='backBtn' type='button' value='Toggle' onclick='document.location.href = "/settings/toggle?which=${Object.keys(settings)[i]}"'><br><br>`;
    }

    res.send(`
        <head><title>Alarm System</title></head>

        <style>
            * {
                text-align: center;
            }

            #backBtn {
                width: 5%;
                height: 3%;
            }
        </style>
        <h1>Settings</h1>
        <br>
        ${pageData}
        <br>
        <input  id="backBtn" type="button" value="Back" onclick="document.location.href = '../'">
    `);
});

// -- Settings Toggle --
app.get('/settings/toggle', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    if (req.query.which) {
        settings[req.query.which].value = !settings[req.query.which].value;
    }
    res.send(`
    <script>document.location.href="/settings"</script>
    `);
});

// -- Test Sound Page --
app.get('/test', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    log('Sound Test Initialized');
    exec(`sudo omxplayer ${rootDir}/alarm_sfx.mp3 --vol 100`, (err, stdout, stderr) => {
        if (err) {
            //console.error(err)
        } else {
            //console.log(`stderr: ${stderr}`);
        }
    });
    res.send('<script>document.location.href="../"</script>');    
});

// -- Set Cancelled pages --
app.get('/cancel/true', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    cancelled = true;
    log('Next Alarm Was Cancelled!');
    res.send('<script>document.location.href="/cancel"</script>');
});

app.get('/cancel/false', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    cancelled = false;
    log('Next Alarm Was Uncancelled!');
    res.send('<script>document.location.href="/cancel"</script>');
});

// Toggle System
app.get('/toggle', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    if (systemActive) {
        systemActive = false;
        log('Alarm System Turned Off');
    } else {
        systemActive = true;
        log('Alarm System Turned On');
    }
    res.send('<script>document.location.href="../"</script>');
});

// Toggle Debug
app.get('/debug', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    if (debugMode) {
        debugMode = false;
        log('Debug Mode Turned Off');
    } else {
        debugMode = true;
        log('Debug Mode Turned On');
    }
    res.send('<script>document.location.href="../"</script>');
});

// Modify Page
app.get('/modify', function (req, res) {
    if (!req.query.dotw) {
    na = getNextAlarm();
    nDOTW = na.tempToday.getDay();
    } else {
        nDOTW = Number(req.query.dotw);
    }
    nextData = JSON.parse(JSON.stringify(alarmData[nDOTW])); // this line is the worst thing to ever exist

    if (nextData.hours >= 12) {
        if (nextData.hours != 12) {
            nextData.hours = nextData.hours - 12;   
        }
        selectedIndex = 1;
    } else if (nextData.hours == 0) {
        nextData.hours = 12;
    } else {
        selectedIndex = 0;
    }

    if (req.query.changed != undefined) {
        dispChangedMsg = "";
    } else {
        dispChangedMsg = "style='display: none'";
    }
    if (req.query.reset != undefined) {
        dispResetMsg = "";
    } else {
        dispResetMsg = "style='display: none'";
    }
    res.send(`
        <head><title>Alarm System</title></head>

        <style>
            * {
                text-align: center;
            }
            input {
                width: 10%;
                height: 5%;
                font-size: 15pt;
            }

            #backBtn {
                width: 5%;
                height: 3%;
            }

            #resetBtn {
                width: 6%;
                height: 3%;
                font-size: 12pt;  
            }
            #colon {
                font-size: 15pt;
            }

            #ampm {
                width: 10%;
                height: 5%;
                font-size: 15pt;     
                text-align: center;
            }

            #changedMsg {
                color: red;
            }

            #resetMsg {
                color: red;
            }

            #header {
              font-size: 35pt;  
              font-weight: bold;
            }

            #dotw {
                width: 15%;
                height: 8%;
                font-size: 35pt;
                font-weight: bold;
                border: 1px solid #fff;
                background-color: transparent;
            }
        </style>

        <p id="header">Modify Alarm on 
        <select name="dotw" id="dotw" onchange="document.location.href='./modify?dotw='+document.getElementById('dotw').selectedIndex;;">
        <option value="Sunday">Sunday</option>
        <option value="Monday">Monday</option>
        <option value="Tuesday">Tuesday</option>
        <option value="Wednesday">Wednesday</option>
        <option value="Thursday">Thursday</option>
        <option value="Friday">Friday</option>
        <option value="Saturday">Saturday</option>
        </select>
        </p>
        <h2 ${dispChangedMsg} id="changedMsg">Alarm was modified!</h2>
        <h2 ${dispResetMsg} id="resetMsg">All Alarms Were Reset To Default Values! (Put a cancel in if the default time is still in the future)</h2>
        <h3>Hours:</h3>
        <input id="hours" type="number" min="1" max="12" value="${nextData.hours}">
        <h3>Minutes:</h3>
        <input id="minutes" type="number" min="0" max="59" value="${nextData.minutes}"><br><br>
        <h3>AM / PM:</h3>
        <select name="ampm" id="ampm">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
        </select>
        <br><br>
        <input id="submit" type="submit" value="Submit" onclick="go()">
        <br><br><br>
        <input id="resetBtn" type="button" value="Reset" onclick="document.location.href = '../'">
        <br><br><br>
        <input id="backBtn" type="button" value="Back" onclick="document.location.href = '../'">

        <script>
            function go() {
                var hours = document.getElementById('hours').value;
                var minutes = document.getElementById('minutes').value;
                var amPm = document.getElementById('ampm').value;
                var dotw = document.getElementById('dotw').selectedIndex;
                document.location.href = './modify/go?hours='+hours+'&minutes='+minutes+'&ampm='+amPm+'&dotw='+dotw;
            }

            function loop() {
                mEl = document.getElementById('minutes');

                if (mEl.value.toString().length == 1) {
                    mEl.value = "0" + mEl.value;
                }

                setTimeout(loop,50);
            }

            function defaultResetBtn() {
                document.getElementById('resetBtn').value = "Reset All";
                document.getElementById('resetBtn').onclick = () => {
                    document.getElementById('resetBtn').value = "Press Again";
                    document.getElementById('resetBtn').onclick = () => {
                        document.location.href='./modify/reset';
                    }
                    setTimeout(defaultResetBtn,5000);
                };    
            }
            loop();
            defaultResetBtn();
            document.getElementById('ampm').selectedIndex = ${selectedIndex};
            document.getElementById('dotw').selectedIndex = ${nDOTW};
        </script>
    `);
});

// Modify GO page
app.get('/modify/go', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    queryParams = req.query;

    dotw = Number(queryParams.dotw);
    hours = Number(queryParams.hours);
    minutes = Number(queryParams.minutes);
    amPm = queryParams.ampm;
    if (amPm == 'PM') {
        if (hours != 12) {
            hours += 12;
        }
    }
    if (hours == 12 && amPm == "AM") {
        hours = 0;
    }
    modifyAlarm(dotw,hours,minutes);
    res.send('<script>document.location.href="../modify?changed&dotw='+dotw+'"</script>');
});

// Modify reset page
app.get('/modify/reset', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    alarmData = JSON.parse(JSON.stringify(origAlarmData));
    for (var i=0;i<modifiedData.length;i++) {
        modifiedData[i] = [false,0];
    }
    res.send('<script>document.location.href="../modify?reset"</script>');
});

// Force Picture Take page
app.get('/cam/force', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    takePicture(true);
    res.send(`
    <p>Please wait</p>
    <script>
        setTimeout(() => {
            document.location.href = "../cam";
        },1000);
    </script>
    `);
});

// Storage page (for camera photo)
app.use('/storage', express.static('public'))

// Camera Page
app.get('/cam', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    res.send(`
    <head><title>Alarm System</title></head>


    <img id='img' onerror="document.getElementById('img').outerHTML = '<h2>Photo could not be loaded.</h2><p>The unique ID likely changed since the last photo was taken, a photo has not been taken yet, or the alarm is stopped and the photo was archived. Current ID is ${photoID}</p>';"></img>
    <br><br>
    <input type="button" id="forcePicture" value="Take Picture" onclick="document.location.href='./cam/force'">
    <input type="button" id="newID" value="Generate New ID" onclick="document.location.href='./cam/newID'">
    <br><br>
    <input id="backBtn" type="button" value="Back" onclick="document.location.href = '../'">
    <script>
        function updateCam() {
            camImg = document.getElementById('img');
            d = new Date();
            camImg.src = "../storage/cam_${photoID}.jpg?ts="+ Date.now();
            setTimeout(updateCam,1500);
        }

        updateCam();
    </script>
    
    `);
});

// Generate New ID Page
app.get('/cam/newID', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../noAccess';
        </script>
        `);
        return false;
    }

    setNewPhotoID();
    res.send(`
    <p>Please wait. (Generating New ID)</p>
    <script>
        setTimeout(() => {
            document.location.href = "../cam";
        },1000);
    </script>
    `);
});

// Archive Page
app.get('/storage/archive', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../../noAccess';
        </script>
        `);
        return false;
    }

    if (!archiveWebcam) {
        res.send(`
        <script>
            document.location.href = '../../';
        </script>
        `);
        return false;
    }

    injectString = "";
    filterString = "";
    archFiles = [];
    possibleYears = [];
    possibleMonths = [];
    possibleDays = [];
    req.queryParams
    fs.readdirSync("public/archive").forEach(file => {
        archFiles.push(file);
      });

    archFiles.forEach((file) => {
        datePart = file.split('camarch_')[1].split("_")[0].substr(0,6);
        monthPart = datePart.substr(0,2);
        dayPart = datePart.substr(2,2);
        yearPart = datePart.substr(4,2);
        if (possibleYears.indexOf(yearPart) == -1) {
            possibleYears.push(yearPart);
        }
        if (possibleMonths.indexOf(monthPart) == -1) {
            possibleMonths.push(monthPart);
        }
        if (possibleDays.indexOf(dayPart) == -1) {
            possibleDays.push(dayPart);
        }

        passFilters = true;

        if (req.query.y) {
            if (req.query.y != yearPart) {
                passFilters = false;
            }
        }

        if (req.query.m) {
            if (req.query.m != monthPart) {
                passFilters = false;
            }
        }

        if (req.query.d) {
            if (req.query.d != dayPart) {
                passFilters = false;
            }
        }

        if (passFilters) {
            injectString += `<a href='./viewer?f=${file}'>${file}</a><br>`;
        }
    });

    currentAnchor = "";
    gotAnchors = Object.keys(req.query);

    for (var i=0;i<gotAnchors.length;i++) {
        currentAnchor += ((i > 0) ? "&" : "?") + gotAnchors[i] + "=" + req.query[gotAnchors[i]];
    }

    anchorSymbol = "";

    if (gotAnchors.length == 0) {
        anchorSymbol = "?";
    } else {
        anchorSymbol = "&";       
    }

    if (gotAnchors.length > 0) {
        filterDescription = "<h3>Current Filters:</h3>";

        if (req.query.y) {
            filterDescription += `Year: ${req.query.y}<br><br>`;
        }
        if (req.query.m) {
            filterDescription += `Month: ${req.query.m}<br><br>`;
        }
        if (req.query.d) {
            filterDescription += `Day: ${req.query.d}<br><br>`;
        }

        filterDescription += `<input type="button" value="Clear Filters" onclick="document.location.href = '.?'"><br>`;

    } else {
        filterDescription = "";
    }
    if (!req.query.y) {
        filterString += "<h3>Filter Year:</h3>";
        possibleYears.forEach((year) => {
            filterString += `<a href='./${currentAnchor}${anchorSymbol}y=${year}'>${year}  </a>`;
        });
        filterString += "<br>";
    }
    if (!req.query.m) {
        filterString += "<h3>Filter Month:</h3>";
        possibleMonths.forEach((month) => {
            filterString += `<a href='./${currentAnchor}${anchorSymbol}m=${month}'>${month}  </a>`;
        }); 
        filterString += "<br>";
    }

    if (!req.query.d) {
        filterString += "<h3>Filter Day:</h3>";
        possibleDays.forEach((day) => {
            filterString += `<a href='./${currentAnchor}${anchorSymbol}d=${day}'>${day}  </a>`;
        }); 
    }

    res.send(`
    <head><title>Alarm System</title></head>

    <h1>Archive</h1>
    ${filterDescription}
    ${filterString}
    <br>
    <h3>Files</h3>
    ${injectString}
    <br><br><br>
    <input type='button' value='Back' onclick='document.location.href="../../"'>
    `);
});

// Generate New ID Page
app.get('/storage/archive/viewer', function (req, res) {

    if (!hasAccess()) {
        res.send(`
        <script>
            document.location.href = '../../../noAccess';
        </script>
        `);
        return false;
    }

    if (!archiveWebcam) {
        res.send(`
        <script>
            document.location.href = '../../../';
        </script>
        `);
        return false;
    }

    if (!req.query.f) {
        res.send(`
        <script>
            document.location.href = '../';
        </script>
        `);
        return false;
    }
    res.send(`
    <img src='${req.query.f}' style="border: black solid 3px;">
    <br>
    <input type='button' value='Back' onclick='document.location.href="../"'>
    `);
});

// No Access Page

app.get('/noAccess', function (req, res) {

    res.send(`
    <head><title>Alarm System</title></head>

    <h1>No Access!</h1>
    <p>The USB dongle must be plugged in to access this.</p>
    <input type='button' value='Back' onclick='document.location.href="../"'>
    `);
});

// ** -- MAIN LOOP -- **
function run() {

    // Photo ID Timer
    photoIDTimer--;

    if (photoIDTimer <= 0) {
        // generate new ID & reset timer
        photoIDTimer = 120;
        setNewPhotoID();
    }

    if (webcamCooldown > 0) {  
        webcamCooldown--;   
    }

    // take picture

    if (useIFTTT) {
        if (webcamCooldown == 0) {
            takePicture(false);
        }
    } else {
        takePicture(false);
    }

    if (debugMode && settings.debugLogTime.value) {
        // will only happen if debug is toggled on and setting is on
        console.log(new Date());      
    }
    var testDate = new Date();

    // test alarm
    if (testDate.getHours() == alarmData[testDate.getDay()].hours && testDate.getMinutes() == alarmData[testDate.getDay()].minutes && testDate.getSeconds() == 0) {
        if (systemActive) {
            if (!cancelled) {
                // alarm succesfully went off
                log('Alarm has gone off!');
                alarmRunning = true; 
                webcamCooldown = 3;
                plugControl(true);

            } else {
                cancelled = false;
                log('Alarm was scheduled to go off, but it was set to be cancelled today.');         
            }
        } else {
            log('Alarm was scheduled to go off, but the system is currently inactive.');
        }
    }
    // play sound
    if (new Date().getSeconds() % (soundLength+1) == 0 && alarmRunning && settings.soundOn.value) {
        exec(`sudo omxplayer ${rootDir}/alarm_sfx.mp3 --vol 100`, (err, stdout, stderr) => {
            if (err) {
                //console.error(err)
            } else {
                //console.log(`stdout: ${stdout}`);
                //console.log(`stderr: ${stderr}`);
            }
        });
    }

    // test to automatically turn off modified alarms
    for (var i=0;i<modifiedData.length;i++) {
        if (modifiedData[i][0]) {
            if ((new Date().getTime() - modifiedData[i][1]) >= 1000*(unmodifyDays*24*60*60)) {
                modifiedData[i] = [false,0];
                alarmData[i] = {
                    hours: origAlarmData[i].hours,
                    minutes: origAlarmData[i].minutes
                };
                log("Alarm for " + days[i] + " was reset to its default time of " + formatDNum(alarmData[i].hours) + ":" + formatDNum(alarmData[i].minutes)) + " automatically, because it has been active for " + unmodifyDays;
            }
        }
    }
    setTimeout(run,1000);
}
//alarmRunning = true;
run();
log('System Starting...');

function runTTS() {
    var d = new Date();
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var spokenDates = ["First","Second","Thi bhrd","Fourth","Fifth","Sixth","Seventh","Eighth","Ninth","Tenth","Eleventh","Twelfth","Thirteenth","Fourteenth","Fifteenth","Sixteenth","Seventeenth","Eighteenth","Nineteenth","Twentieth","Twenty-first","Twenty-second","Twenty-third","Twenty-fourth","Twenty-fifth","Twenty-sixth","Twenty-Seventh","Twenty-eighth","Twenty-Ninth","Thirtieth","Thirty-first"];
    var ttsText = "Good Morning, Today is " + days[d.getDay()] + ", " + months[d.getMonth()] + " " + spokenDates[d.getDate()-1] + ".";

    // event finder
    var todaysEvents = [];
    eventData.forEach((el) => {
        if (d.getDate() == el.day && months[d.getMonth()] == el.month) {
            todaysEvents.push(el);
        }
    });

    if (todaysEvents.length > 0) {
        if (todaysEvents.length == 1) {
            ttsText += " You have 1 memory slash event for today: ";
        } else {
            ttsText += " You have " + todaysEvents.length + " memories slash events for today. ";
        }
    }
    var eventAmt = 0;
    todaysEvents.forEach((el) => {

        eventAmt++;

        if (todaysEvents.length > 1) {
            ttsText += "Number " + eventAmt + ": ";    
        }
        // if year provided
        if (el.year) {
            diff = d.getFullYear() - el.year;

            if (diff == 1) {
                ttsText += diff + " year ago today, "; 
            } else if (diff > 1) {
                ttsText += diff + " years ago today, ";           
            }
        }

        ttsText += el.desc;     
    });

    // send tts to IBM Watson
    ttsText = ttsText.replace(/ /g,'%20').replace(/,/g,'%2C');
    log("Sent " + ttsText + " to IBM Watson");
    var cmd = `sudo curl -X GET -u "apikey:${process.env.API_TOKEN}" \ --output tts_out.wav \ "${process.env.ENDPOINT}/v1/synthesize?accept=audio%2Fwav&text=${ttsText}"`;
    exec(cmd, (err, stdout, stderr) => {

        if (err) {
            console.error(err)
        } else {
            //console.log(`stdout: ${stdout}`);
            //console.log(`stderr: ${stderr}`);
            exec(`sudo omxplayer ${rootDir}/tts_out.wav --vol 100`, (err, stdout, stderr) => {
                if (err) {
                    //console.error(err)
                }
            });
        }
    });
}

function modifyAlarm(dotw,h,m) {

    if (typeof h == "number" && typeof m == "number" && typeof dotw == "number") {
        alarmData[dotw].hours = h;
        alarmData[dotw].minutes = m;
        modifiedData[dotw] = [true,new Date().getTime()];
        log('Alarm for ' + days[dotw] + ' temp. changed to: ' + formatDNum(h) + ':' + formatDNum(m));
    } else {
        log('At least one parameter for modifyNext was not a valid number. Aborted.');
    }
}

function takePicture(ignoreConditions) {
    if ((useWebcam && alarmRunning) || ignoreConditions) {

        // take the picture
        exec(`sudo fswebcam  --no-banner --no-timestamp --crop 170x60,150x100 public/cam_${photoID}.jpg`, (err, stdout, stderr) => {
            var camResolution = [170,60];
                // vertical offset;
                var camOffset = 0;
                if (fs.existsSync(`public/cam_${photoID}.jpg`)) {

                    inkjet.decode(fs.readFileSync(`public/cam_${photoID}.jpg`), (err, decoded) => {
                        if (!err) {
                            camData = Array.from(decoded.data);
                            if (camOffset > 0) {
                                camData.splice(0,(camOffset*camResolution[0]*4)-1);
                            }
        
                            if (previousData.length > 1) {
                                camDiff = 0;
                                for (var i=0;i<camData.length-3;i += 4) {
                                    currentTotal = camData[i] + camData[i+1] + camData[i+3];
                                    previousTotal = previousData[i] + previousData[i+1] + previousData[i+3];
                                    camDiff += Math.abs(previousTotal - currentTotal);
                                }

                                if (camDiff >= camThreshold) {
                                    if (alarmRunning) {
                                        // Alarm has been stopped due to webcam
                                        log("Alarm stopped due to webcam trigger!");
                                        alarmRunning = false;
                                        setTimeout(plugControl,(plugWait*1000),false);
                                        archiveCam();
                                        if (settings.soundOn.value) {
                                            setTimeout(runTTS,soundLength);
                                        }
                                    } else {
                                        log("Webcam trigger activated, but alarm was already stopped.");                             
                                    }
                                }
                                if (debugMode) {
                                    console.log("Webcam Diff: " + camDiff);
                                }
                            }
                            previousData = JSON.parse(JSON.stringify(camData));
                        }
                    });
                }
        });
    } else {
        return false;
    }
}

function plugControl(value) {
    // controls smart plugs using IFTTT

    if (!useIFTTT) {
        return false;
    }
    let webhookNames = ["lampOn","lampOff"];

    let ind = (value) ? 0 : 1

    var cmd = `sudo curl -X POST https://maker.ifttt.com/trigger/${webhookNames[ind]}/with/key/${process.env.IFTTT_TOKEN}`;
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.log(err);
        }
    });
}

function archiveCam() {

    if (!archiveWebcam || !useWebcam) {
        return false;
    }

    let d = new Date();
    fileExt = formatDNum(d.getMonth()+1) + formatDNum(d.getDate()) + formatDNum(d.getFullYear().toString().substr(2,2)) + formatDNum(d.getHours()) + formatDNum(d.getMinutes()) + "_" + Math.random().toString(36).substr(2, 6);
    exec(`mv public/cam_${photoID}.jpg public/archive/camarch_${fileExt}.jpg`, (err, stdout, stderr) => {
        if (err) {
            console.log(err);
        }
    });
}

// -- utility functions --

function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDNum(num) {
    // adds leading 0 if number is single didgit
    if (num.toString().length == 1) {
        return "0"+num.toString();
    } else {
        return num.toString();
    }
}
function log(msg) {
    // console logs message with date and time
    d = new Date();
    dateDisp = formatDNum(d.getMonth() + 1) + "/" + formatDNum(d.getDate()) + "/" + formatDNum(d.getFullYear()) + " ";
    dateDisp += formatDNum(d.getHours()) + ":" + formatDNum(d.getMinutes()) + ":" + formatDNum(d.getSeconds()) + " >> ";
    console.log(dateDisp + msg);
}

function getNextAlarm() {
   // get next alarm  
   var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
   var today  = new Date();
   var todayAlarm = alarmData[today.getDay()];
   var todayAlarmUnix = new Date((today.getMonth() + 1) + "/" + today.getDate() + "/" + today.getFullYear()+" " + todayAlarm.hours + ":" + todayAlarm.minutes + ":0").getTime();
   if (todayAlarmUnix > today.getTime()) {
       // alarm still has not happened yet today
       var tempToday;
       if (cancelled) {
           var dotw = today.getDay() + 1;
           if (dotw == 7) {
               dotw = 0;
           }   
           tempToday = addDays(today,1);
       } else {
           dotw = today.getDay();
           tempToday = today;
       }
       var nAlarm = alarmData[today.getDay()];
   } else {
       // alarm has happened today, get tommorow's alarm
       var tempToday;
       if (cancelled) {
           var dotw = today.getDay() + 2;
           if (dotw == 8) {
               dotw = 1;
           }   
           tempToday = addDays(today,2);
       } else {
           var dotw = today.getDay() + 1;
           if (dotw == 7) {
               dotw = 0;
           }   
           tempToday = addDays(today,1);
       }
       var nAlarm = alarmData[tempToday.getDay()];
   }
   var dotwIndex = tempToday.getDay();

   if (cancelled) {
       dotwIndex--;
       if (dotwIndex == -1) {
           dotwIndex = 6;
       }
   }
   var cancelledDOTW = days[dotwIndex];
   var nAlarmUnix = new Date((tempToday.getMonth() + 1) + "/" + tempToday.getDate() + "/" + tempToday.getFullYear()+" " + nAlarm.hours + ":" + nAlarm.minutes + ":0").getTime();
   return {
    nAlarmUnix: nAlarmUnix,
    cancelledDOTW: cancelledDOTW,
    tempToday: tempToday
   }
}

function hasAccess() {

    if (usesDongle) {
        // make sure usb is mounted
        exec('sudo mount -a', (err, stderr, stdout) => {
            if (err) {
                //console.log(err);
            }
        });

        return fs.existsSync('/mnt/dongle/access.txt');
    }
    return true;
}

function setNewPhotoID() {

    // remove previous picture
    exec(`rm -f public/*.jpg`, (err, stdout, stderr) => {
        if (err) {
            console.log(err);
        }
    });

    // generate new ID
    photoID = Math.random().toString(36).substr(2, 10);
}
