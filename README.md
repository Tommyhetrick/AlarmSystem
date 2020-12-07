# AlarmSystem
DIY Morning Alarm on a Raspberry Pi using nodeJS

This program plays a alarm at a set time each day of the week through my speakers.
When the alarm is stopped, it uses IBM Watson Text to Speech tp say what day it is and will tell you events that you specify.

Dependencies:
* [Express](https://expressjs.com)
* [dotenv](https://github.com/motdotla/dotenv)
* [InkJet](https://www.npmjs.com/package/inkjet) (Optional for webcam feature)
* [fswebcam](https://github.com/fsphil/fswebcam) (Optional for webcam feature)
Important:
You need to create a service on IBM Watson Cloud for Text to Speech and enter the details in the .env file in the root.
alarn_sfx.mp3 must exist in the root directory.
As I have it setup, this uses omxplayer to play audio files because I am using a older Raspberry Pi
Make sure the constant variable rootDir reflects the directory of the script
