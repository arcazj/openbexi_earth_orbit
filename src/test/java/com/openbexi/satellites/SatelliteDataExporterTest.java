package test.java.com.openbexi.satellites;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.json.simple.JSONObject;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class SatelliteDataExporterTest {

    @TempDir
    Path tempDir;
    private String originalUserDir;

    @BeforeEach
    void setUp() {
        originalUserDir = System.getProperty("user.dir");
        System.setProperty("user.dir", tempDir.toString());
    }

    @AfterEach
    void tearDown() {
        System.setProperty("user.dir", originalUserDir);
    }

    private String invoke(String norad) throws Exception {
        Method m = Class.forName("com.openbexi.satellites.SatelliteDataExporter")
                .getDeclaredMethod("getLaunchDateByNorad", String.class);
        m.setAccessible(true);
        return (String) m.invoke(null, norad);
    }

    @Test
    void returnsLaunchDateWhenIdFound() throws Exception {
        Path file = tempDir.resolve(Paths.get("json", "tle", "satellite_launch_dates.json"));
        Files.createDirectories(file.getParent());
        Files.writeString(file,
                "[{\"name\":\"TEST\",\"norad_id\":\"39188\",\"launch_date\":\"2013-06-25\"}]");

        String result = invoke("39188");
        assertEquals("2013-06-25", result);
    }

    @Test
    void returnsNoDataWhenFileAbsentOrIdMissing() throws Exception {
        // file does not exist
        String result = invoke("99999");
        assertEquals("no data", result);

        // file exists but id not present
        Path file = tempDir.resolve(Paths.get("json", "tle", "satellite_launch_dates.json"));
        Files.createDirectories(file.getParent());
        Files.writeString(file,
                "[{\"name\":\"TEST\",\"norad_id\":\"12345\",\"launch_date\":\"2024-01-01\"}]");

        result = invoke("99999");
        assertEquals("no data", result);
    }

    @Test
    void ignoresDuplicateNoradIds() throws Exception {
        Method m = Class.forName("com.openbexi.satellites.SatelliteDataExporter")
                .getDeclaredMethod("addSatelliteIfAbsent", Map.class, JSONObject.class);
        m.setAccessible(true);

        Map<String, JSONObject> satellites = new LinkedHashMap<>();

        JSONObject first = new JSONObject();
        first.put("norad_id", "12345");
        first.put("satellite_name", "FIRST");

        JSONObject duplicate = new JSONObject();
        duplicate.put("norad_id", "12345");
        duplicate.put("satellite_name", "DUPLICATE");

        m.invoke(null, satellites, first);
        m.invoke(null, satellites, duplicate);

        assertEquals(1, satellites.size());
        assertEquals("FIRST", satellites.get("12345").get("satellite_name"));
    }
}
