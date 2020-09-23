// Alarm Script
const fs = require('fs');
const express = require('express');
const { exec } = require('child_process');
const { SSL_OP_TLS_BLOCK_PADDING_BUG } = require('constants');
const app = express();
require('dotenv').config();
var alarmRunning = false;
var systemActive = true;
var debugMode = false;
const port = 80;
const soundLength = 3;
const timeOffset = 4;
var cancelled = false;
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
        hours: 11,
        minutes: 0
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

// event (memories) data. end with a period
const eventData = [
    {
        desc: "This alarm was created.",
        year: 2020,
        month: "September",
        day: 20
    }
    // the other events I had here were redacted for Github :)
];

// -- Script start --

// express server stuff
app.listen(port, () => {
    log(`Express app listening at http://localhost:${port}`);
});
//app.use('/', express.static('public'));
app.get('/', function (req, res) {

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
        var nAlarm = alarmData[today.getDay()];
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
        toggleDebugTxt = "Disable Console Debug";
    } else {
        toggleDebugTxt = "Enable Console Debug";     
    }

    if (alarmRunning) {
        stopBtnMod = "";
    } else {
        stopBtnMod = "style='background-color: rgb(127,127,127)'";
    }

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
    <br>
    <input type="button" id="test">
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
        setTimeout(runTTS(),soundLength);
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
    if (systemActive) {
        if (!cancelled) {
            alarmRunning = true;
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

// -- Test Sound Page --
app.get('/test', function (req, res) {
    log('Sound Test Initialized');
    exec('sudo omxplayer /home/pi/alarm/alarm_sfx.mp3 --vol 100', (err, stdout, stderr) => {
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
    cancelled = true;
    log('Next Alarm Was Cancelled!');
    res.send('<script>document.location.href="/cancel"</script>');
});

app.get('/cancel/false', function (req, res) {
    cancelled = false;
    log('Next Alarm Was Uncancelled!');
    res.send('<script>document.location.href="/cancel"</script>');
});

// Toggle System
app.get('/toggle', function (req, res) {
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
    if (debugMode) {
        debugMode = false;
        log('Console Debug Turned Off');
    } else {
        debugMode = true;
        log('Console Debug Turned On');
    }
    res.send('<script>document.location.href="../"</script>');
});

// -- MAIN LOOP --
function run() {
    if (debugMode) {
        // will only happen if debug is toggled on
        console.log(new Date());      
    }
    var testDate = new Date();

    if (testDate.getHours() == alarmData[testDate.getDay()].hours && testDate.getMinutes() == alarmData[testDate.getDay()].minutes && testDate.getSeconds() < 3) {
        if (systemActive) {
            if (!cancelled) {
                log('Alarm has gone off!');
                alarmRunning = true; 
            } else {
                cancelled = false;
                log('Alarm was scheduled to go off, but it was set to be cancelled today.');         
            }
        } else {
            log('Alarm was scheduled to go off, but the system is currently inactive.');
        }
    }
    if (new Date().getSeconds() % (soundLength+1) == 0 && alarmRunning) {
        exec('sudo omxplayer /home/pi/alarm/alarm_sfx.mp3 --vol 100', (err, stdout, stderr) => {
            if (err) {
                //console.error(err)
            } else {
                //console.log(`stdout: ${stdout}`);
                //console.log(`stderr: ${stderr}`);
            }
        });
    }
    setTimeout(run,1000);
}
//alarmRunning = true;
run();
log('System Starting...');
function runTTS() {
    var d = new Date();
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
            exec('sudo omxplayer /home/pi/alarm/tts_out.wav --vol 100', (err, stdout, stderr) => {
                if (err) {
                    //console.error(err)
                }
            });
        }
    });
}

// utility functions

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