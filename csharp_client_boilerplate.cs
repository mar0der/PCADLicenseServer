using System;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

// NOTE: This file is a transport-level example for the current snapshot-based plugin contract.
// Real Dokaflex production code also verifies the RSA signature on the returned snapshot payload
// before trusting any server-authored access or ribbon data.

namespace YourRevitPlugin
{
    public static class PluginApiClient
    {
        private static readonly HttpClient Client = new HttpClient();

        private const string API_URL = "https://pcad.petarpetkov.com/api";
        private const string PLUGIN_SECRET = "your-plugin-secret-from-server-env";
        private const string PLUGIN_SLUG = "dokaflex";

        public static async Task<string> RefreshAccessSnapshotAsync(
            string machineFingerprint,
            string revitVersion = "2024",
            string pluginVersion = "26.13.49")
        {
            string jsonPayload = BuildIdentityPayload(machineFingerprint, revitVersion, pluginVersion);

            using (var message = CreateSignedPost($"{API_URL}/plugin/access/refresh", jsonPayload))
            using (HttpResponseMessage response = await Client.SendAsync(message).ConfigureAwait(false))
            {
                string responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                response.EnsureSuccessStatusCode();

                // TODO: Verify the returned envelope signature against access-snapshot.public.pem.
                return responseBody;
            }
        }

        public static async Task<string> RefreshPluginConfigAsync(
            string machineFingerprint,
            string revitVersion = "2024",
            string pluginVersion = "26.13.49")
        {
            string jsonPayload = BuildIdentityPayload(machineFingerprint, revitVersion, pluginVersion);

            using (var message = CreateSignedPost($"{API_URL}/plugin/config/refresh", jsonPayload))
            using (HttpResponseMessage response = await Client.SendAsync(message).ConfigureAwait(false))
            {
                string responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                response.EnsureSuccessStatusCode();
                return responseBody;
            }
        }

        public static Task SendUsageBatchAsync(
            string commandKey,
            string machineFingerprint,
            string snapshotId,
            string revitVersion = "2024",
            string pluginVersion = "26.13.49")
        {
            string username = Environment.UserName ?? string.Empty;
            string occurredAtUtc = DateTime.UtcNow.ToString("o");
            string eventId = Guid.NewGuid().ToString("D");
            string jsonPayload =
                "{" +
                $"\"pluginSlug\":\"{EscapeJson(PLUGIN_SLUG)}\"," +
                "\"events\":[" +
                "{" +
                $"\"eventId\":\"{EscapeJson(eventId)}\"," +
                $"\"commandKey\":\"{EscapeJson(commandKey)}\"," +
                $"\"username\":\"{EscapeJson(username)}\"," +
                $"\"machineFingerprint\":\"{EscapeJson(machineFingerprint)}\"," +
                $"\"pluginVersion\":\"{EscapeJson(pluginVersion)}\"," +
                $"\"revitVersion\":\"{EscapeJson(revitVersion)}\"," +
                $"\"occurredAtUtc\":\"{EscapeJson(occurredAtUtc)}\"," +
                $"\"snapshotId\":\"{EscapeJson(snapshotId)}\"" +
                "}" +
                "]" +
                "}";

            using (var message = CreateSignedPost($"{API_URL}/plugin/usage/batch", jsonPayload))
            {
                return Client.SendAsync(message);
            }
        }

        private static string BuildIdentityPayload(string machineFingerprint, string revitVersion, string pluginVersion)
        {
            string username = Environment.UserName ?? string.Empty;
            string machineName = Environment.MachineName ?? string.Empty;
            return
                "{" +
                $"\"pluginSlug\":\"{EscapeJson(PLUGIN_SLUG)}\"," +
                $"\"username\":\"{EscapeJson(username)}\"," +
                $"\"machineName\":\"{EscapeJson(machineName)}\"," +
                $"\"machineFingerprint\":\"{EscapeJson(machineFingerprint)}\"," +
                $"\"revitVersion\":\"{EscapeJson(revitVersion)}\"," +
                $"\"pluginVersion\":\"{EscapeJson(pluginVersion)}\"" +
                "}";
        }

        private static HttpRequestMessage CreateSignedPost(string url, string jsonPayload)
        {
            string signature = GenerateHmacSignature(jsonPayload, PLUGIN_SECRET);
            var message = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json"),
            };
            message.Headers.TryAddWithoutValidation("X-Plugin-Signature", signature);
            return message;
        }

        private static string GenerateHmacSignature(string payload, string secret)
        {
            byte[] keyByte = Encoding.UTF8.GetBytes(secret);
            byte[] messageBytes = Encoding.UTF8.GetBytes(payload);

            using (var hmacsha256 = new HMACSHA256(keyByte))
            {
                byte[] hashmessage = hmacsha256.ComputeHash(messageBytes);
                var hex = new StringBuilder(hashmessage.Length * 2);
                foreach (byte b in hashmessage)
                {
                    hex.AppendFormat("{0:x2}", b);
                }

                return hex.ToString();
            }
        }

        private static string EscapeJson(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n")
                .Replace("\t", "\\t");
        }
    }
}
