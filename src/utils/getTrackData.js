import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

let token;

const getTrackData = async ({ track_id }) => {
  const getToken = async () => {
    try {
      const response = await axios.post("https://accounts.spotify.com/api/token",
        {
          grant_type: 'client_credentials',
          client_id,
          client_secret
        }, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      token = response.data.access_token;
    } catch (error) {
      throw new Error("Error on token retrival: " + error);
    }
  }
  
  const getData = async () => {
    try {
      const response = await axios.get(`https://api.spotify.com/v1/tracks/${track_id}?market=US`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return { 
        name: response.data.name, 
        artist: response.data.artists[0].name,
        image: response.data.album.images[1].url,
        preview_url: response.data.preview_url, 
      };
    } catch (error) {
      throw new Error("Error on Track retrival: " + error);
    }
  }
  try {
    if (!token) await getToken();
    const trackData = await getData();
    return trackData;
  } catch (error) {
    console.error(error);
  }
}

export default getTrackData;