using UnityEngine;
using System.Collections;
using System.IO.Ports;


public class Rotator : MonoBehaviour {

	SerialPort port_clip = null;
	SerialPort port_head = null;

	void Start ()
	{
		// init clip serial port
		port_clip = new SerialPort("COM6", 115200);
		port_clip.Open();

		// init head serial port
		port_head = new SerialPort("COM7", 115200);
		port_head.Open();

		// init wii
	}

	void Update ()
	{
		// get clip quaternion from port_clip

		// get head quaternion from port_head

		// compute head-space clip orientation

		// compute best LEDs

		// send LED state to clip

		// get IR points

		// estimate depth from IR points & clip orientation

		// draw clip
		//int rotation = int.Parse (serial.ReadLine ());
		//transform.localEulerAngles = new Vector3(0,rotation,0);
	}
}
