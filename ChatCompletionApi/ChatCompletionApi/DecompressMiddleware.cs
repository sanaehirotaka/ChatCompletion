using System.IO.Compression;
using Microsoft.Net.Http.Headers;

namespace ChatCompletionApi;

public class DecompressMiddleware(RequestDelegate next, ILogger<DecompressMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext httpContent)
    {
        var encoding = httpContent.Request.Headers.ContentEncoding.FirstOrDefault()?.ToLower();
        if (encoding == "gzip")
        {
            try
            {
                await DecompressGzip(httpContent);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to decompress request body due to invalid data.");
                httpContent.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContent.Response.WriteAsync("Invalid compressed Data");
                return;
            }
        }
        else if (encoding == "br")
        {
            try
            {
                await DecompressBr(httpContent);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to decompress request body due to invalid data.");
                httpContent.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContent.Response.WriteAsync("Invalid compressed Data");
                return;
            }
        }
        await next(httpContent);
    }

    private async Task DecompressGzip(HttpContext httpContent)
    {
        httpContent.Request.EnableBuffering();
        using var stream = new GZipStream(httpContent.Request.Body, CompressionMode.Decompress, leaveOpen: true);

        var memory = new MemoryStream();
        await stream.CopyToAsync(memory);
        memory.Seek(0, SeekOrigin.Begin);

        ApplyStream(httpContent, memory);
    }

    private async Task DecompressBr(HttpContext httpContent)
    {
        httpContent.Request.EnableBuffering();
        using var stream = new BrotliStream(httpContent.Request.Body, CompressionMode.Decompress, leaveOpen: true);

        var memory = new MemoryStream();
        await stream.CopyToAsync(memory);
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
