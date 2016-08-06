#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>

/* This driver reads raw data from the BNO055

   Connections
   ===========
   Connect SCL to analog 5
   Connect SDA to analog 4
   Connect VIN to 5V DC
   Connect ADO to GND

   History
   =======
   2015/MAR/03  - First release (KTOWN)
*/

/* Set the delay between fresh samples */
#define BNO055_SAMPLERATE_DELAY_MS (10)

Adafruit_BNO055 bno = Adafruit_BNO055();

#define ANGLE_PIN   3
#define BEACON_MIN  2
#define BEACON_MAX  5
#define CLIP        1
#define HEAD        2

int beaconMask = 0xff;
/**************************************************************************/
/*
    Arduino setup function (automatically called at startup)
*/
/**************************************************************************/
void beaconInit() {
  int i;
  for (i = BEACON_MIN; i <= BEACON_MAX; ++i) {
    pinMode(i, OUTPUT);
  }
}

void beaconUpdate() {
  int i;
  for (i = BEACON_MIN; i <= BEACON_MAX; ++i) {
    digitalWrite(i, (beaconMask & 1 << i) ? HIGH : LOW);
  }
}

void setup(void)
{
  beaconInit();
  Serial.begin(115200);
  //Serial.println("Orientation Sensor Raw Data Test"); Serial.println("");

  /* Initialise the sensor */
  if (!bno.begin())
  {
    /* There was a problem detecting the BNO055 ... check your connections */
    //Serial.println("Ooops, no BNO055 detected ... Check your wiring or I2C ADDR!");
    while (1);
  }

  delay(1000);

  /* Display the current temperature */
  /*
  int8_t temp = bno.getTemp();
  Serial.print("Current Temperature: ");
  Serial.print(temp);
  Serial.println(" C");
  Serial.println("");
  */

  bno.setExtCrystalUse(true);

  //Serial.println("Calibration status values: 0=uncalibrated, 3=fully calibrated");
}

/**************************************************************************/
/*
    Arduino loop function, called once 'setup' is complete (your own code
    should go here)
*/
/**************************************************************************/
#define PACKET_LENGTH   (46)

#define PACKET_QUAT     (2)

void loop(void)
{
  int angle = 0;

  beaconUpdate();

  angle = analogRead(ANGLE_PIN);

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
  out[2] = CLIP;
  
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
  out[43] = (char)(angle - 470);

  // done
  out[44] = '\r';
  out[45] = '\n';

  Serial.write(out, PACKET_LENGTH);

  if (Serial.available() > 0) {
    beaconMask = Serial.read() << BEACON_MIN;
  }

  delay(BNO055_SAMPLERATE_DELAY_MS);
}
