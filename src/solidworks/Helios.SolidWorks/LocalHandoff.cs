using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Helios.SolidWorks
{
    // One temporary transfer, not an installed service. No listener accepts modeling commands.
    public static class LocalHandoff
    {
        static Thread pending;
        public static void WaitForPending() { pending?.Join(125000); }
        public static string Open(string archive, string origin)
        {
            if (new FileInfo(archive).Length > 64 * 1024 * 1024) throw new InvalidOperationException("The workspace exceeds the 64 MB browser handoff limit. The local export has been retained.");
            var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var path = "/" + Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N") + "/workspace.helios.zip";
            var source = "http://127.0.0.1:" + port + path;
            var url = origin + "/solidworks?handoff=" + Uri.EscapeDataString(source);
            var thread = new Thread(() =>
            {
                var deadline = DateTime.UtcNow.AddMinutes(2);
                try
                {
                    while (DateTime.UtcNow < deadline)
                    {
                        if (!listener.Pending()) { Thread.Sleep(50); continue; }
                        using (var client = listener.AcceptTcpClient())
                        {
                            client.ReceiveTimeout = 3000; client.SendTimeout = 10000;
                            using (var stream = client.GetStream())
                            {
                                var header = new StringBuilder();
                                while (header.Length < 8192 && !header.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal)) { var b = stream.ReadByte(); if (b < 0) break; header.Append((char)b); }
                                var request = header.ToString();
                                var permitted = request.StartsWith("GET " + path + " HTTP/1.1\r\n", StringComparison.Ordinal)
                                    && request.IndexOf("\r\nHost: 127.0.0.1:" + port + "\r\n", StringComparison.OrdinalIgnoreCase) >= 0
                                    && request.IndexOf("\r\nOrigin: " + origin + "\r\n", StringComparison.OrdinalIgnoreCase) >= 0;
                                if (!permitted) { var denied = Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); stream.Write(denied, 0, denied.Length); continue; }
                                var bytes = File.ReadAllBytes(archive);
                                var response = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: " + origin + "\r\nContent-Length: " + bytes.Length + "\r\nConnection: close\r\n\r\n");
                                stream.Write(response, 0, response.Length); stream.Write(bytes, 0, bytes.Length); break;
                            }
                        }
                    }
                }
                catch (IOException) { } catch (SocketException) { }
                finally { listener.Stop(); }
            }) { IsBackground = true, Name = "Helios one-use local handoff" };
            pending = thread; thread.Start();
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { listener.Stop(); throw; }
            return url;
        }
    }
}
