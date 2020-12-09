# AlarmSystem
DIY Morning Alarm on a Raspberry Pi using nodeJS

This program plays a alarm at a set time each day of the week through my speakers.
When the alarm is stopped, it uses IBM Watson Text to Speech to say what day it is and will tell you events that you specify.

**Dependencies:**
* [Express](https://expressjs.com)
* [dotenv](https://github.com/motdotla/dotenv)
* [InkJet](https://www.npmjs.com/package/inkjet) (Optional for webcam feature)
* [fswebcam](https://github.com/fsphil/fswebcam) (Optional for webcam feature)

**Webcam**
Optionally, you can plug a usb webcam into your pi which will take a picture every second and compare changes. If the changes are enough, the alarm will tur off.
You must set the cropping of the picture in takePicture() and the threshold value. This will enable /cam and /storage/archive if that is enabled as well. This feature can be turned on with the useWebcam variable.
**IFTT**
You can optionally attach the alarm to IFTT to turn on a lamp using a smart plug which will turn back off after a certain amount of time after the alarm has stopped.
In order to do this, create a webhook trigger in IFTT and change the names in the plugControl function (and make sure useIFTTT is set to true) You must provide your IFTT webhook token in your .env file

**Security USB**
If you set usesDongle to true, pages that will have changes or security concerns like modify, settings, camera, etc. will be denied access to the user if a USB with a file named access.txt does not exist on a USB. (For this feature you must edit /etc/fstab to automount your USB. Mount it on /mnt/dongle. This will allow mount -a used in the script to mount the USB every time it is checked.

**Important:**

You need to create a service on IBM Watson Cloud for Text to Speech and enter the details in the .env file in the root.
alarn_sfx.mp3 must exist in the root directory.
As I have it setup, this uses omxplayer to play audio files because I am using a older Raspberry Pi
Make sure the constant variable rootDir reflects the directory of the script
