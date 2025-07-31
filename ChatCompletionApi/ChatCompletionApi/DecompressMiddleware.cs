using System.IO.Compression;
using Microsoft.Net.Http.Headers;

namespace ChatCompletionApi;

public class DecompressMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContent)
    {
        var encoding = httpContent.Request.Headers.ContentEncoding.FirstOrDefault()?.ToLower();
        if (encoding == "gzip")
        {
            try
            {
                DecompressGzip(httpContent);
            }
            catch
            {
                httpContent.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContent.Response.WriteAsync("Invalid gzip compressed Data");
                return;
            }
        }
        else if (encoding == "br")
        {
            try
            {
                DecompressBr(httpContent);
            }
            catch
            {
                httpContent.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContent.Response.WriteAsync("Invalid brotli compressed Data");
                return;
            }
        }
        await next(httpContent);
    }

    private void DecompressGzip(HttpContext httpContent)
    {
        httpContent.Request.EnableBuffering();
        using var stream = new GZipStream(httpContent.Request.Body, CompressionMode.Decompress, leaveOpen: true);

        var memory = new MemoryStream();
        stream.CopyTo(memory);
        memory.Seek(0, SeekOrigin.Begin);

        ApplyStream(httpContent, memory);
    }

    private void DecompressBr(HttpContext httpContent)
    {
        httpContent.Request.EnableBuffering();
        using var stream = new BrotliStream(httpContent.Request.Body, CompressionMode.Decompress, leaveOpen: true);

        var memory = new MemoryStream();
        stream.CopyTo(memory);
        memory.Seek(0, SeekOrigin.Begin);

        ApplyStream(httpContent, memory);
    }

    private void ApplyStream(HttpContext httpContent, Stream stream)
    {
        httpContent.Request.Headers.Remove(HeaderNames.ContentEncoding);
        httpContent.Request.Headers.Remove(HeaderNames.ContentLength);
        httpContent.Request.Body = stream;
    }
}
