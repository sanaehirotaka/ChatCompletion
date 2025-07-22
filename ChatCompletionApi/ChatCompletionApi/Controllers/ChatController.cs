using System.Security.Cryptography;
using ChatCompletionApi.Service;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.SemanticKernel;

namespace ChatCompletionApi.Controllers;

/// <summary>
/// チャット関連のAPIエンドポイントを提供します。
/// </summary>
[Route("api/[controller]")]
[ApiController]
public class ChatController : ControllerBase
{
    private static readonly string? PASS_PHRASE = Environment.GetEnvironmentVariable("PASS_PHRASE");

    private readonly IMemoryCache _memoryCache;

    private readonly ChatCompletionService _chatCompletionService;

    /// <summary>
    /// ChatControllerの新しいインスタンスを初期化します。
    /// </summary>
    /// <param name="chatCompletionService">チャット完了サービス。</param>
    public ChatController(IMemoryCache memoryCache, ChatCompletionService chatCompletionService)
    {
        _memoryCache = memoryCache;
        _chatCompletionService = chatCompletionService;
    }

    /// <summary>
    /// チャットメッセージのコンテンツを取得します。
    /// </summary>
    /// <param name="request">チャットリクエスト。</param>
    /// <returns>チャットメッセージコンテンツのリスト。</returns>
    [HttpPost]
    [Produces("application/json")]
    public async Task<ActionResult<List<ChatMessageContent>>> Talk([FromBody] ChatCompletionService.ChatRequest request)
    {
        if (!Validate() || !Refresh())
        {
            NewChallenge();
            return Unauthorized(new {});
        }
        return await _chatCompletionService.GetChatMessageContentsAsync(request);
    }

    private bool Validate()
    {
        if (!Request.Headers.TryGetValue("X-Auth-Ticket", out var authTicket))
        {
            return false;
        }
        if (!Request.Headers.TryGetValue("X-Auth-Response", out var authResponse))
        {
            return false;
        }
        if (!_memoryCache.TryGetValue($"ticket:{authTicket}", out string? challenge))
        {
            return false;
        }
        using var stream = new MemoryStream();
        using (var writer = new StreamWriter(stream))
        {
            writer.Write(PASS_PHRASE);
            writer.Write(authTicket);
            writer.Write(challenge);
            writer.Flush();
        }
        return Convert.ToBase64String(SHA256.HashData(stream.ToArray())) == authResponse;
    }

    private void NewChallenge()
    {
        var ticketRandom = new byte[6];
        Random.Shared.NextBytes(ticketRandom);
        var ticket = Convert.ToBase64String(ticketRandom);

        var challengeRandom = new byte[18];
        Random.Shared.NextBytes(challengeRandom);
        var challenge = Convert.ToBase64String(challengeRandom);

        Response.Headers.Append("X-Auth-Ticket", ticket);
        Response.Headers.Append("X-Auth-Challenge", challenge);

        _memoryCache.Set($"ticket:{ticket}", challenge, new MemoryCacheEntryOptions()
        {
            Size = 1,
            Priority = CacheItemPriority.Low,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(3)
        });
    }

    private bool Refresh()
    {
        if (!Request.Headers.TryGetValue("X-Auth-Ticket", out var authTicket))
        {
            return false;
        }
        if (!_memoryCache.TryGetValue($"ticket:{authTicket}", out string? challenge))
        {
            return false;
        }

        Response.Headers.Append("X-Auth-Ticket", authTicket);
        Response.Headers.Append("X-Auth-Challenge", challenge);

        _memoryCache.Set($"ticket:{authTicket}", challenge, new MemoryCacheEntryOptions()
        {
            Size = 1,
            Priority = CacheItemPriority.Normal,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(60)
        });

        return true;
    }
}
