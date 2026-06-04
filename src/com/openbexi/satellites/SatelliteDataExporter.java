package com.openbexi.satellites;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Paths;
import java.util.Calendar;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

public class SatelliteDataExporter {
    private static final double EARTH_RADIUS_KM = 6378.137;
    private static final double EARTH_MU_KM3_S2 = 398600.4418;
    private static final double MINUTES_PER_DAY = 1440.0;

    public static void main(String[] args) {
        try {
            extractLaunchDates();
        } catch (Exception e) {
            e.printStackTrace();
        }

        // STEP 2: Process TLE sources from CelesTrak and produce the simplified JSON structure.
        String[] sourceUrls = {
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=intelsat&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=ses&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=eutelsat&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=telesat&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=hulianwang&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=other-comm&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=qianfan&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=kuiper&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=argos&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=dmc&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=education&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=gorizont&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=molniya&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=orbcomm&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=planet&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=raduga&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=spire&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=tdrss&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
                "http://celestrak.org/NORAD/elements/gp.php?GROUP=x-comm&FORMAT=tle",
                //"http://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
        };
        /*String[] sourceUrls = {
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"};*/;

        Map<String, JSONObject> satellitesByNorad = new LinkedHashMap<>();
        for (String url : sourceUrls) {
            try {
                String company = extractGroupFromUrl(url);
                String tleText = fetchTLEFromUrl(url);
                String[] lines = tleText.split("\\r?\\n");
                // Process the TLE text in blocks of 3 lines: name, TLE line1, TLE line2.
                for (int i = 0; i < lines.length; i++) {
                    if (lines[i].trim().isEmpty())
                        continue;
                    if (i + 2 >= lines.length)
                        break;
                    String nameLine = lines[i].trim();
                    String tleLine1 = lines[i + 1].trim();
                    String tleLine2 = lines[i + 2].trim();
                    JSONObject sat = transformSatelliteTLEObject(company, nameLine, tleLine1, tleLine2);
                    addSatelliteIfAbsent(satellitesByNorad, sat);
                    i += 2;  // Advance to the next block.
                }
            } catch (IOException e) {
                System.err.println("Error processing URL: " + url);
                e.printStackTrace();
            }
        }

        String outputPath = "json/tle/TLE.json";
        try {
            JSONArray allSatellites = new JSONArray();
            for (JSONObject sat : satellitesByNorad.values()) {
                allSatellites.add(sat);
            }
            writeJsonToFile(allSatellites, outputPath);
            System.out.println("Exported satellite data to " + outputPath);
        } catch (IOException e) {
            System.err.println("Error writing JSON to file: " + outputPath);
            e.printStackTrace();
        }
    }

    // ---------------------------
    // Functions for extracting launch dates from n2yo
    // ---------------------------

    /**
     * Iterates over years (from 1990 to current) and months (01 to 12) to fetch and extract launch dates.
     * It writes the results to "json/tle/satellite_launch_dates.json".
     */
    private static void extractLaunchDates() {
        Map<String, JSONObject> launchDates = new LinkedHashMap<>();
        Map<String, String> nameToNorad = new HashMap<>();
        int currentYear = Calendar.getInstance().get(Calendar.YEAR);
        for (int year = 1990; year <= currentYear; year++) {
            for (int month = 1; month <= 12; month++) {
                String monthStr = (month < 10) ? "0" + month : String.valueOf(month);
                String url = "https://www.n2yo.com/browse/?y=" + year + "&m=" + monthStr;
                try {
                    String html = fetchHtmlFromUrl(url);
                    JSONArray pageLaunches = extractLaunchDatesFromPage(html);
                    for (Object obj : pageLaunches) {
                        JSONObject sat = (JSONObject) obj;
                        String noradId = sat.get("norad_id").toString();
                        String name = sat.get("name").toString();

                        if (launchDates.containsKey(noradId)) {
                            JSONObject removed = launchDates.remove(noradId);
                            String removedName = removed.get("name").toString();
                            String mappedNorad = nameToNorad.get(removedName);
                            if (mappedNorad != null && mappedNorad.equals(noradId)) {
                                nameToNorad.remove(removedName);
                            }
                        }

                        if (nameToNorad.containsKey(name)) {
                            String previousNorad = nameToNorad.remove(name);
                            launchDates.remove(previousNorad);
                        }

                        launchDates.put(noradId, sat);
                        nameToNorad.put(name, noradId);
                    }
                } catch (IOException e) {
                    System.err.println("Error fetching launch dates for " + year + "-" + monthStr);
                    e.printStackTrace();
                }
            }
        }
        try {
            JSONArray uniqueLaunchDates = new JSONArray();
            for (JSONObject sat : launchDates.values()) {
                uniqueLaunchDates.add(sat);
            }
            writeJsonToFile(uniqueLaunchDates, "json/tle/satellite_launch_dates.json");
            System.out.println("Extracted launch dates saved to json/tle/satellite_launch_dates.json");
        } catch (IOException e) {
            System.err.println("Error writing launch dates file");
            e.printStackTrace();
        }
    }

    /**
     * Fetches the HTML content from the given URL.
     */
    private static String fetchHtmlFromUrl(String urlStr) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0");
        int responseCode = conn.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new IOException("HTTP error code: " + responseCode);
        }
        BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder content = new StringBuilder();
        String inputLine;
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine).append("\n");
        }
        in.close();
        conn.disconnect();
        return content.toString();
    }

    /**
     * Uses a regex pattern to extract satellite launch rows from an n2yo HTML page.
     * For each row it extracts:
     * - Satellite name (from the anchor text)
     * - NORAD ID (from the second table cell)
     * - Launch date (from the third table cell)
     */
    private static JSONArray extractLaunchDatesFromPage(String html) {
        JSONArray arr = new JSONArray();
        // Regex to match rows like:
        // <tr BGCOLOR=#C6FFE2><td><a href="/satellite/?s=58712">STARLINK-31029</a></td><td align="center">58712</td><td align="center">2024-01-03</td>
        String patternStr = "<tr\\s+BGCOLOR=[^>]+><td><a\\s+href=\"[^\"]+\">([^<]+)</a></td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>";
        Pattern pattern = Pattern.compile(patternStr);
        Matcher matcher = pattern.matcher(html);
        while (matcher.find()) {
            String name = matcher.group(1).trim();
            String noradId = matcher.group(2).trim();
            String launchDate = matcher.group(3).trim();
            JSONObject obj = new JSONObject();
            obj.put("name", name);
            obj.put("norad_id", noradId);
            obj.put("launch_date", launchDate);
            arr.add(obj);
        }
        return arr;
    }

    /**
     * Reads the launch dates file ("json/tle/satellite_launch_dates.json") and returns
     * the launch date for the given NORAD ID (or "no data" if not found).
     */
    private static String getLaunchDateByNorad(String noradId) {
        String launchDate = "no data";
        try {
            File file = Paths.get(System.getProperty("user.dir"), "json", "tle", "satellite_launch_dates.json").toFile();
            if (!file.exists())
                return launchDate;
            JSONParser parser = new JSONParser();
            Object obj = parser.parse(new FileReader(file));
            if (obj instanceof JSONArray) {
                JSONArray arr = (JSONArray) obj;
                for (Object o : arr) {
                    JSONObject sat = (JSONObject) o;
                    // Compare as strings
                    if (noradId.equals(sat.get("norad_id").toString())) {
                        launchDate = sat.get("launch_date").toString();
                        break;
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return launchDate;
    }

    // ---------------------------
    // Functions for processing TLE data from CelesTrak
    // ---------------------------

    /**
     * Extracts the GROUP parameter from the URL and returns it in uppercase.
     */
    private static String extractGroupFromUrl(String url) {
        String group = "no data";
        int index = url.indexOf("GROUP=");
        if (index != -1) {
            int start = index + "GROUP=".length();
            int end = url.indexOf("&", start);
            if (end == -1) {
                end = url.length();
            }
            group = url.substring(start, end);
        }
        return group.toUpperCase();
    }

    /**
     * Fetches the TLE text from the given URL.
     */
    private static String fetchTLEFromUrl(String urlStr) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0");
        int responseCode = conn.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            BufferedReader errorReader = new BufferedReader(new InputStreamReader(conn.getErrorStream()));
            StringBuilder errorContent = new StringBuilder();
            String line;
            while ((line = errorReader.readLine()) != null) {
                errorContent.append(line);
            }
            errorReader.close();
            throw new IOException("HTTP error code: " + responseCode + " " + errorContent.toString());
        }
        BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder content = new StringBuilder();
        String inputLine;
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine).append("\n");
        }
        in.close();
        conn.disconnect();
        return content.toString();
    }

    /**
     * Adds a satellite entry only if the NORAD ID is not already present.
     */
    private static void addSatelliteIfAbsent(Map<String, JSONObject> satellitesByNorad, JSONObject satellite) {
        String noradId = satellite.get("norad_id").toString();
        satellitesByNorad.putIfAbsent(noradId, satellite);
    }

    /**
     * Transforms a 3-line TLE block (name, TLE line1, TLE line2) into a simplified JSON object.
     * It extracts the NORAD ID from TLE line1 (characters 3–7), determines the orbit type,
     * and looks up the launch date (using getLaunchDateByNorad).
     */
    private static JSONObject transformSatelliteTLEObject(String company, String nameLine, String tleLine1, String tleLine2) {
        JSONObject sat = new JSONObject();
        sat.put("company", company);
        sat.put("satellite_name", (nameLine != null && !nameLine.isEmpty()) ? nameLine : "no data");

        String noradId = "no data";
        if (tleLine1 != null && tleLine1.length() >= 7) {
            noradId = tleLine1.substring(2, 7).trim();
        }
        sat.put("norad_id", noradId);

        String launchDate = getLaunchDateByNorad(noradId);
        sat.put("launch_date", launchDate);

        JSONObject orbitMetrics = extractOrbitMetrics(tleLine2);
        String orbit = determineOrbit(orbitMetrics);
        sat.put("type", orbit);
        sat.put("orbit_class", orbit);
        for (Object key : orbitMetrics.keySet()) {
            sat.put(key, orbitMetrics.get(key));
        }

        sat.put("tle_line1", (tleLine1 != null && !tleLine1.isEmpty()) ? tleLine1 : "no data");
        sat.put("tle_line2", (tleLine2 != null && !tleLine2.isEmpty()) ? tleLine2 : "no data");

        return sat;
    }

    /**
     * Extracts useful orbit metadata from TLE line 2.
     */
    private static JSONObject extractOrbitMetrics(String tleLine2) {
        JSONObject metrics = new JSONObject();
        if (tleLine2 == null || tleLine2.isEmpty()) {
            return metrics;
        }

        String[] tokens = tleLine2.trim().split("\\s+");
        if (tokens.length < 8) {
            return metrics;
        }

        Double inclinationDeg = parseDouble(tokens[2]);
        Double eccentricity = parseTleEccentricity(tokens[4]);
        Double meanMotion = parseDouble(tokens[7]);

        putIfFinite(metrics, "inclination_deg", inclinationDeg);
        putIfFinite(metrics, "eccentricity", eccentricity);
        putIfFinite(metrics, "mean_motion_rev_per_day", meanMotion);

        if (meanMotion != null && meanMotion > 0) {
            double periodMin = MINUTES_PER_DAY / meanMotion;
            double meanMotionRadPerSec = meanMotion * 2.0 * Math.PI / 86400.0;
            double semiMajorAxisKm = Math.cbrt(EARTH_MU_KM3_S2 / (meanMotionRadPerSec * meanMotionRadPerSec));
            double safeEccentricity = eccentricity != null ? eccentricity : 0.0;
            double perigeeKm = semiMajorAxisKm * (1.0 - safeEccentricity) - EARTH_RADIUS_KM;
            double apogeeKm = semiMajorAxisKm * (1.0 + safeEccentricity) - EARTH_RADIUS_KM;
            double estimatedAltitudeKm = (perigeeKm + apogeeKm) / 2.0;

            putIfFinite(metrics, "period_min", periodMin);
            putIfFinite(metrics, "semi_major_axis_km", semiMajorAxisKm);
            putIfFinite(metrics, "perigee_km", perigeeKm);
            putIfFinite(metrics, "apogee_km", apogeeKm);
            putIfFinite(metrics, "estimated_altitude_km", estimatedAltitudeKm);
        }

        return metrics;
    }

    /**
     * Determines orbit class from derived metrics, keeping the old LEO/MEO/GEO
     * behavior while identifying highly eccentric objects.
     */
    private static String determineOrbit(JSONObject metrics) {
        Object meanMotionObj = metrics.get("mean_motion_rev_per_day");
        Object eccentricityObj = metrics.get("eccentricity");
        Object perigeeObj = metrics.get("perigee_km");
        Object apogeeObj = metrics.get("apogee_km");

        if (!(meanMotionObj instanceof Number)) {
            return "no data";
        }

        double meanMotion = ((Number) meanMotionObj).doubleValue();
        double eccentricity = eccentricityObj instanceof Number ? ((Number) eccentricityObj).doubleValue() : 0.0;
        double perigeeKm = perigeeObj instanceof Number ? ((Number) perigeeObj).doubleValue() : Double.NaN;
        double apogeeKm = apogeeObj instanceof Number ? ((Number) apogeeObj).doubleValue() : Double.NaN;

        if (Double.isFinite(perigeeKm) && perigeeKm < 120) {
            return "DECAYING";
        }
        if (eccentricity > 0.25 || (Double.isFinite(apogeeKm) && apogeeKm > 50000)) {
            return "HEO";
        }
        if (meanMotion < 2.5) {
            return "GEO";
        }
        if (meanMotion > 11.0) {
            return "LEO";
        }
        return "MEO";
    }

    private static Double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static Double parseTleEccentricity(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        try {
            return Double.parseDouble("0." + token.replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static void putIfFinite(JSONObject obj, String key, Double value) {
        if (value != null && Double.isFinite(value)) {
            obj.put(key, value);
        }
    }

    /**
     * Writes the given JSON array to a file at the specified path.
     */
    private static void writeJsonToFile(JSONArray jsonArray, String filePath) throws IOException {
        File file = new File(filePath);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        try (FileWriter writer = new FileWriter(file)) {
            writer.write(jsonArray.toJSONString());
        }
    }
}
