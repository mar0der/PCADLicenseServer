using System;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

// NOTE: This file is a boilerplate example of what to include in your Revit Plugin's C# project.
// You will need to install Newtonsoft.Json (or use System.Text.Json) for serialization.
// In your IExternalApplication.OnStartup method, call: Task.Run(async () => await LicenseManager.VerifyAccessAsync()).Wait();

namespace YourRevitPlugin
{
    public static class LicenseManager
    {
        private static readonly HttpClient client = new HttpClient();
        
        // Configuration
        private const string API_URL = "http://your-ubuntu-server-ip/api";
        private const string PLUGIN_SECRET = "your-very-long-and-secure-random-string"; // Must match NEXT_AUTH process.env.PLUGIN_SECRET
        
        // Cache Configuration
        private static string CacheFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
            "YourRevitPlugin", 
            "license.cache"
        );

        public static async Task<bool> VerifyAccessAsync(string revitVersion = "2024")
        {
            try
            {
                // 1. Check Cache
                if (IsCacheValid())
                {
                    return true;
                }

                // 2. Prepare Payload
                var username = Environment.UserName;
                var machineName = Environment.MachineName;
                
                string jsonPayload = $"{{\"username\":\"{username}\",\"machineName\":\"{machineName}\",\"revitVersion\":\"{revitVersion}\"}}";

                // 3. Generate HMAC Signature
                string signature = GenerateHmacSignature(jsonPayload, PLUGIN_SECRET);

                // 4. Send Request
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                content.Headers.Add("X-Plugin-Signature", signature);

                HttpResponseMessage response = await client.PostAsync($"{API_URL}/auth/verify", content);

                if (response.IsSuccessStatusCode)
                {
                    // Access Granted: Save cache
                    SaveCache();
                    return true;
                }
                
                // Access Denied
                return false;
            }
            catch (Exception ex)
            {
                // Decide fail-open or fail-closed on network errors.
                // Usually for internal tools, fail-open (return true) is better if the server is temporarily down,
                // but strictly speaking, fail-closed (return false) is more secure.
                System.Diagnostics.Debug.WriteLine($"Licensing Error: {ex.Message}");
                return false;
            }
        }

        public static async Task LogUsageAsync(string functionName)
        {
            try
            {
                var username = Environment.UserName;
                string jsonPayload = $"{{\"username\":\"{username}\",\"functionName\":\"{functionName}\"}}";
                string signature = GenerateHmacSignature(jsonPayload, PLUGIN_SECRET);

                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                content.Headers.Add("X-Plugin-Signature", signature);

                // Fire and forget (don't await in the main thread of Revit)
                _ = client.PostAsync($"{API_URL}/usage/log", content);
            }
            catch { /* Ignore logging errors to prevent annoying the user */ }
        }

        private static string GenerateHmacSignature(string payload, string secret)
        {
            var encoding = new UTF8Encoding();
            byte[] keyByte = encoding.GetBytes(secret);
            byte[] messageBytes = encoding.GetBytes(payload);

            using (var hmacsha256 = new HMACSHA256(keyByte))
            {
                byte[] hashmessage = hmacsha256.ComputeHash(messageBytes);
                // The JS implementation expects a hex string
                StringBuilder hex = new StringBuilder(hashmessage.Length * 2);
                foreach (byte b in hashmessage)
                    hex.AppendFormat("{0:x2}", b);
                return hex.ToString();
            }
        }

        private static bool IsCacheValid()
        {
            if (!File.Exists(CacheFilePath)) return false;

            try
            {
                var lastCheckedStr = File.ReadAllText(CacheFilePath);
                if (DateTime.TryParse(lastCheckedStr, out DateTime lastChecked))
                {
                    // Cache is valid for 24 hours
                    return (DateTime.UtcNow - lastChecked).TotalHours < 24;
                }
            }
            catch { /* Ignore IO errors */ }
            return false;
        }

        private static void SaveCache()
        {
            try
            {
                var dir = Path.GetDirectoryName(CacheFilePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(CacheFilePath, DateTime.UtcNow.ToString("o"));
                // Optionally encrypt this file using ProtectedData.Protect for more security
            }
            catch { /* Ignore IO errors */ }
        }
    }
}
