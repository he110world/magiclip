#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
#include <EEPROM.h>

/* This driver uses the Adafruit unified sensor library (Adafruit_Sensor),
   which provides a common 'type' for sensor data and some helper functions.

   To use this driver you will also need to download the Adafruit_Sensor
   library and include it in your libraries folder.

   You should also assign a unique ID to this sensor for use with
   the Adafruit Sensor API so that you can identify this particular
   sensor in any data logs, etc.  To assign a unique ID, simply
   provide an appropriate value in the constructor below (12345
   is used by default in this example).

   Connections
   ===========
   Connect SCL to analog 5
   Connect SDA to analog 4
   Connect VDD to 3-5V DC
   Connect GROUND to common ground

   History
   =======
   2015/MAR/03  - First release (KTOWN)
   2015/AUG/27  - Added calibration and system status helpers
   2015/NOV/13  - Added calibration save and restore
   */

/* Set the delay between fresh samples */
#define BNO055_SAMPLERATE_DELAY_MS (100)

Adafruit_BNO055 bno = Adafruit_BNO055(55);

/**************************************************************************/
/*
    Arduino setup function (automatically called at startup)
    */
/**************************************************************************/
void setup(void)
{
    pinMode(13, OUTPUT);
    Serial.begin(115200);
    //delay(1000);

    /* Initialise the sensor */
    if (!bno.begin())
    {
        while (1);
    }

    int eeAddress = 0;
    long bnoID;
    bool foundCalib = false;
    EEPROM.get(eeAddress, bnoID);

    adafruit_bno055_offsets_t calibrationData;
    sensor_t sensor;

    /*
    *  Look for the sensor's unique ID at the beginning oF EEPROM.
    *  This isn't foolproof, but it's better than nothing.
    */
    bno.getSensor(&sensor);
    if (bnoID != sensor.sensor_id)
    {
        //No Calibration Data for this sensor exists in EEPROM
        delay(500);
    }
    else
    {
        //Found Calibration for this sensor in EEPROM.
        eeAddress += sizeof(long);
        EEPROM.get(eeAddress, calibrationData);

        //Restoring Calibration data to the BNO055
        //bno.setSensorOffsets(calibrationData);

        //Calibration data loaded into BNO055
        foundCalib = true;
    }

    delay(1000);

    bno.setExtCrystalUse(true);

    sensors_event_t event;
    bno.getEvent(&event);
    if (foundCalib){
        //while (!bno.isFullyCalibrated())
        {
            bno.getEvent(&event);
            delay(BNO055_SAMPLERATE_DELAY_MS);
        }
    }
    else
    {
        while (!bno.isFullyCalibrated())
        {
            bno.getEvent(&event);
            
            //Wait the specified delay before requesting new data
            delay(BNO055_SAMPLERATE_DELAY_MS);
        }

        adafruit_bno055_offsets_t newCalib;
        bno.getSensorOffsets(newCalib);
    
        //Storing calibration data to EEPROM
        eeAddress = 0;
        bno.getSensor(&sensor);
        bnoID = sensor.sensor_id;
    
        EEPROM.put(eeAddress, bnoID);
    
        eeAddress += sizeof(long);
        EEPROM.put(eeAddress, newCalib);
    }

    digitalWrite(13, HIGH);
    
    delay(500);
}

#define PACKET_LENGTH   (46)
#define PACKET_QUAT     (2)
#define ANGLE_PIN   3
#define BEACON_MIN  2
#define BEACON_MAX  5
#define CLIP        1
#define HEAD        2

void loop() {
// Quaternion data
  imu::Quaternion q = bno.getQuat();
  imu::Vector<3> g = bno.getVector(Adafruit_BNO055::VECTOR_GYROSCOPE);
  imu::Vector<3> a = bno.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL);

  float w = q.w();
  float x = q.x();
  float y = q.y();
  float z = q.z();

  float gx = g.x();
  float gy = g.y();
  float gz = g.z();

  float ax = a.x();
  float ay = a.y();
  float az = a.z();

  long quat[4] = {*(long*)&w, *(long*)&x, *(long*)&y, *(long*)&z};
  long gyro[3] = {*(long*)&gx, *(long*)&gy, *(long*)&gz};
  long accel[3] = {*(long*)&ax, *(long*)&ay, *(long*)&az};

  char out[PACKET_LENGTH];

  out[0] = '$';
  out[1] = PACKET_QUAT;
  out[2] = HEAD;

  // quat
  out[3] = (char)(quat[0] >> 24);
  out[4] = (char)(quat[0] >> 16);
  out[5] = (char)(quat[0] >> 8);
  out[6] = (char)quat[0];
  out[7] = (char)(quat[1] >> 24);
  out[8] = (char)(quat[1] >> 16);
  out[9] = (char)(quat[1] >> 8);
  out[10] = (char)quat[1];
  out[11] = (char)(quat[2] >> 24);
  out[12] = (char)(quat[2] >> 16);
  out[13] = (char)(quat[2] >> 8);
  out[14] = (char)quat[2];
  out[15] = (char)(quat[3] >> 24);
  out[16] = (char)(quat[3] >> 16);
  out[17] = (char)(quat[3] >> 8);
  out[18] = (char)quat[3];

  // gyro
  out[19] = (char)(gyro[0] >> 24);
  out[20] = (char)(gyro[0] >> 16);
  out[21] = (char)(gyro[0] >> 8);
  out[22] = (char)gyro[0];
  out[23] = (char)(gyro[1] >> 24);
  out[24] = (char)(gyro[1] >> 16);
  out[25] = (char)(gyro[1] >> 8);
  out[26] = (char)gyro[1];
  out[27] = (char)(gyro[2] >> 24);
  out[28] = (char)(gyro[2] >> 16);
  out[29] = (char)(gyro[2] >> 8);
  out[30] = (char)gyro[2];

  // linear accel
  out[31] = (char)(accel[0] >> 24);
  out[32] = (char)(accel[0] >> 16);
  out[33] = (char)(accel[0] >> 8);
  out[34] = (char)accel[0];
  out[35] = (char)(accel[1] >> 24);
  out[36] = (char)(accel[1] >> 16);
  out[37] = (char)(accel[1] >> 8);
  out[38] = (char)accel[1];
  out[39] = (char)(accel[2] >> 24);
  out[40] = (char)(accel[2] >> 16);
  out[41] = (char)(accel[2] >> 8);
  out[42] = (char)accel[2];

  // angle
  out[43] = 0;

  // done
  out[44] = '\r';
  out[45] = '\n';


  Serial.write(out, PACKET_LENGTH);
  delay(10);
}

